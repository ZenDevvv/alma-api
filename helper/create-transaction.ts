import { getLogger } from "./logger";
import { generateNextNumber } from "./generateDeliverCode";
import { performStockAdjustment } from "./perform-stock-adjustment";
import { logActivity } from "../utils/activityLogger";
import { logAudit } from "../utils/auditLogger";
import { config } from "../config/constant";
import { invalidateCache } from "../middleware/cache";
import { Request } from "express";
import { PrismaClient } from "../generated/prisma";

const logger = getLogger();
const transactionLogger = logger.child({ module: "transaction" });

export const createTransaction = async (
	prisma: PrismaClient,
	transactionData: any,
	sourceCode: string,
	referenceEntity: any,
	req: Request,
) => {
	const { type, destinationId } = transactionData;
	console.log("referenceEntity", JSON.stringify(referenceEntity, null, 2));

	// Generate transaction number with sequence, incorporating source code (department or supplier)
	const prefix = `TX-${sourceCode}`;
	const transactionResult = await generateNextNumber(prisma, "transaction", {
		prefix,
		digits: 4,
	});

	const transaction = await prisma.transaction.create({
		data: {
			...transactionData,
			transactionNumber: transactionResult.number,
			sequence: transactionResult.sequence,
			year: transactionResult.year,
		},
	});
	transactionLogger.info(`Transaction created successfully: ${transaction.id}`);

	// Create transaction items for 'in' type using referenceEntity data
	if (
		type === "in" &&
		referenceEntity &&
		referenceEntity.items &&
		referenceEntity.items.length > 0
	) {
		// Create transaction items and adjust stock for each item
		for (const item of referenceEntity.items) {
			// Ensure item and related data exists before processing
			if (
				!item.deliveryOrderItem ||
				!item.deliveryOrderItem.product ||
				typeof item.deliveryOrderItem.quantity !== "number"
			) {
				transactionLogger.warn(
					`Skipping transaction item due to missing data. ReceiptItem ID: ${item.id}`,
				);
				continue;
			}

			const { product, quantity, batchNumber, expiryDate } = item.deliveryOrderItem;

			// Adjust stock and get the new total
			const adjustmentResult = await performStockAdjustment(
				prisma,
				{
					departmentId: destinationId, // For 'in', stock goes to destination
					productId: product.id,
					quantity: quantity,
					operation: "in",
				},
				prisma,
			); // Pass transaction client

			// Create a single transaction item with the correct 'stockAfter'
			await prisma.transactionItem.create({
				data: {
					transaction: {
						connect: { id: transaction.id },
					},
					product: {
						connect: { id: product.id },
					},
					batchNumber: batchNumber,
					expiryDate: expiryDate,
					quantity: quantity,
					stockAfter: adjustmentResult.adjustment.newTotalStock, // Corrected stockAfter
				},
			});
		}
		transactionLogger.info(
			`Created transaction items and adjusted stock for transaction: ${transaction.id}`,
		);
	}

	// Create transaction items for 'out' type using referenceEntity data
	if (
		type === "out" &&
		referenceEntity &&
		referenceEntity.items &&
		referenceEntity.items.length > 0
	) {
		// Create transaction items and adjust stock for each item
		for (const item of referenceEntity.items) {
			// Ensure item and related data exists before processing
			if (!item.product || typeof item.quantity !== "number") {
				transactionLogger.warn(
					`Skipping transaction item due to missing data. OrderItem ID: ${item.id}`,
				);
				continue;
			}

			const { product, quantity, batchNumber, expiryDate } = item;

			const batch = await prisma.batch.findFirst({
				where: {
					batchNumber: batchNumber,
				},
			});

			if (!batch) {
				transactionLogger.warn(`Batch not found for batch number: ${batchNumber}`);
				return;
			}

			// Find the stock item first
			const stockItem = await prisma.stockItem.findFirst({
				where: {
					productId: item.productId,
					batchId: batch.id,
				},
			});

			if (!stockItem) {
				transactionLogger.warn(
					`Stock item not found for productId: ${item.productId} and batchId: ${batch.id}`,
				);
				return;
			}

			// Update using the id field
			await prisma.stockItem.update({
				where: {
					id: stockItem.id,
				},
				data: {
					quantity: {
						decrement: quantity,
					},
				},
			});

			// Adjust stock and get the new total (stock decreases from source)
			const adjustmentResult = await performStockAdjustment(
				prisma,
				{
					departmentId: transactionData.sourceId, // For 'out', stock leaves from source
					productId: product.id,
					quantity: quantity,
					operation: "out",
				},
				prisma,
			); // Pass transaction client

			// Create a single transaction item with the correct 'stockAfter'
			await prisma.transactionItem.create({
				data: {
					transaction: {
						connect: { id: transaction.id },
					},
					product: {
						connect: { id: product.id },
					},
					batchNumber: batchNumber,
					expiryDate: expiryDate,
					quantity: quantity,
					stockAfter: adjustmentResult.adjustment.newTotalStock, // Corrected stockAfter
				},
			});
		}
		transactionLogger.info(
			`Created transaction items and adjusted stock for transaction: ${transaction.id}`,
		);
	}

	logActivity(req, {
		userId: (req as any).user?.id || "unknown",
		action: config.ACTIVITY_LOG.TRANSACTION.ACTIONS.CREATE_TRANSACTION,
		description: `${config.ACTIVITY_LOG.TRANSACTION.DESCRIPTIONS.TRANSACTION_CREATED}: ${transaction.id}`,
		page: {
			url: req.originalUrl,
			title: config.ACTIVITY_LOG.TRANSACTION.PAGES.TRANSACTION_CREATION,
		},
	});

	logAudit(req, {
		userId: (req as any).user?.id || "unknown",
		action: config.AUDIT_LOG.ACTIONS.CREATE,
		resource: config.AUDIT_LOG.RESOURCES.TRANSACTION,
		severity: config.AUDIT_LOG.SEVERITY.LOW,
		entityType: config.AUDIT_LOG.ENTITY_TYPES.TRANSACTION,
		entityId: transaction.id,
		changesBefore: null,
		changesAfter: {
			id: transaction.id,
			createdAt: transaction.createdAt,
			updatedAt: transaction.updatedAt,
		},
		description: `${config.AUDIT_LOG.TRANSACTION.DESCRIPTIONS.TRANSACTION_CREATED}: ${transaction.id}`,
	});

	try {
		await invalidateCache.byPattern("cache:transaction:list:*");
		transactionLogger.info("Transaction list cache invalidated after creation");
	} catch (cacheError) {
		transactionLogger.warn(
			"Failed to invalidate cache after transaction creation:",
			cacheError,
		);
	}

	return transaction;
};
