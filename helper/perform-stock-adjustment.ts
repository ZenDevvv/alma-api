import { PrismaClient } from "@prisma/client";
import { getLogger } from "./logger";
import { AdjustStockQuantitySchema } from "../zod/stock-record.zod";
import { formatZodErrors } from "./error-handler";
import { StockStatus } from "../generated/prisma";

const logger = getLogger();
const stockAdjustmentLogger = logger.child({ module: "stockAdjustment" });

/**
 * Shared function to adjust stock quantity atomically.
 * Validates input, checks entities, and performs upsert in a Prisma transaction.
 * Throws errors on failure (e.g., insufficient stock, invalid entities).
 *
 * @param prisma - PrismaClient instance or transaction client
 * @param input - Validated input data matching AdjustStockQuantitySchema
 * @param tx - Optional transaction client. If provided, uses this instead of creating a new transaction
 * @returns The updated/created stock record
 */
export const performStockAdjustment = async (
	prisma: PrismaClient | any,
	input: {
		departmentId: string;
		productId: string;
		quantity: number;
		operation: "in" | "out";
	},
	tx?: any,
) => {
	// Validate input schema (reusing Zod for consistency)
	const validation = AdjustStockQuantitySchema.safeParse(input);
	if (!validation.success) {
		const formattedErrors = formatZodErrors(validation.error.format());
		stockAdjustmentLogger.error(
			`Stock adjustment validation failed: ${JSON.stringify(formattedErrors)}`,
		);
		throw new Error("Validation failed: " + JSON.stringify(formattedErrors));
	}

	const { departmentId, productId, quantity: positiveQuantity, operation } = validation.data;
	const quantity = operation === "out" ? -positiveQuantity : positiveQuantity;

	try {
		// Use provided transaction client or base prisma client for lookups
		const client = tx || prisma;

		const [department, product] = await Promise.all([
			client.department.findUnique({
				where: { id: departmentId },
				select: { id: true, name: true },
			}),
			client.product.findUnique({
				where: { id: productId },
				select: { id: true, name: true },
			}),
		]);

		if (!department || !product) {
			const errors = [];
			if (!department)
				errors.push({ field: "departmentId", message: "Department not found" });
			if (!product) errors.push({ field: "productId", message: "Product not found" });
			throw new Error("Invalid department or product: " + JSON.stringify(errors));
		}

		// Core stock adjustment logic
		const performAdjustment = async (txClient: any) => {
			const stockRecord = await txClient.stockRecord.findUnique({
				where: { departmentId_productId: { departmentId, productId } },
			});

			const wasCreated = !stockRecord;
			let previousStock = stockRecord?.totalStock ?? 0;

			if (wasCreated && quantity < 0) {
				throw new Error("Cannot initialize stock with negative quantity");
			}

			const newTotalStock = wasCreated ? quantity : previousStock + quantity;
			if (newTotalStock < 0) {
				throw new Error(
					`Insufficient stock: ${previousStock} available, requested deduction: ${-quantity}`,
				);
			}

			// Auto status
			const newStatus: StockStatus =
				newTotalStock === 0
					? "out_of_stock"
					: newTotalStock <= 10
						? "low_stock"
						: "in_stock";

			const updatedRecord = await txClient.stockRecord.upsert({
				where: { departmentId_productId: { departmentId, productId } },
				update: { totalStock: newTotalStock, status: newStatus },
				create: {
					departmentId,
					productId,
					totalStock: newTotalStock,
					status: newStatus,
				},
				include: {
					product: { select: { name: true } },
					department: { select: { name: true } },
				},
			});

			return {
				stockRecord: updatedRecord,
				wasCreated,
				adjustment: { quantity, previousStock, newTotalStock },
			};
		};

		// If transaction client provided, use it directly; otherwise create new transaction
		const result = tx
			? await performAdjustment(tx)
			: await prisma.$transaction(performAdjustment);

		stockAdjustmentLogger.info(
			`Stock adjusted for product ${productId} in department ${departmentId}: ${JSON.stringify(result.adjustment)}`,
		);
		return result;
	} catch (error: any) {
		stockAdjustmentLogger.error("Stock adjustment failed:", error);
		throw error;
	}
};
