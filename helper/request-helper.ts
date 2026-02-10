import { Response } from "express";
import { AuthRequest } from "../middleware/verifyToken";
import { CreateDeliveryOrder } from "../zod/delivery-order.zod";
import { buildErrorResponse } from "./error-handler";
import { getLogger } from "./logger";
import { PrismaClient, Prisma, Role, Department, Supplier, SubRole } from "../generated/prisma";
import { generateNextNumber, generateUniqueCode } from "./generateDeliverCode";
import { createTransaction } from "./create-transaction";

const logger = getLogger();
const deliveryOrderLogger = logger.child({ module: "deliveryOrder" });
const prisma = new PrismaClient();

const validateDeliveryRequest = async (deliveryRequestId: string, res: Response) => {
	const deliveryRequest = await prisma.deliveryRequest.findUnique({
		where: { id: deliveryRequestId },
		include: {
			items: {
				where: { isDeleted: false },
				select: {
					id: true,
					productId: true,
					requestedQuantity: true,
					approvedQuantity: true,
					deliveredQuantity: true,
				},
			},
		},
	});

	if (!deliveryRequest) {
		deliveryOrderLogger.error(`Delivery request not found: ${deliveryRequestId}`);
		const errorResponse = buildErrorResponse("Delivery request not found", 404);
		res.status(404).json(errorResponse);
		return null;
	}

	deliveryOrderLogger.info(`Delivery Request found: ${deliveryRequest.id}`);
	deliveryOrderLogger.info(
		`Delivery Request Items (${deliveryRequest.items.length} items): ${JSON.stringify(deliveryRequest.items, null, 2)}`,
	);

	return deliveryRequest;
};

type RequestItemWithQuantities = {
	id: string;
	productId: string | null;
	requestedQuantity: number;
	approvedQuantity: number | null;
	deliveredQuantity: number | null;
};

const createOrderItems = async (
	tx: Prisma.TransactionClient,
	items: CreateDeliveryOrder["items"],
	validRequestItems: RequestItemWithQuantities[],
	deliveryOrderId: string,
) => {
	const orderItemsData = items.map((item) => {
		const requestItem = validRequestItems.find((ri) => ri.id === item.requestItemId);

		if (!requestItem) {
			throw new Error(`Request item ${item.requestItemId} not found`);
		}

		if (!requestItem.productId) {
			throw new Error(`Product ID not found for request item ${item.requestItemId}`);
		}

		const orderItemData: Prisma.OrderItemCreateManyInput = {
			productId: requestItem.productId!,
			quantity: item.quantity,
			orderId: deliveryOrderId,
			requestItemId: item.requestItemId ?? undefined,
		};

		// Handle lotNumber - optional field now
		if (item.batchNumber) {
			orderItemData.batchNumber = item.batchNumber;
		}

		if (item.notes) {
			orderItemData.notes = item.notes;
		}
		if (item.batchId) {
			orderItemData.batchId = item.batchId;
		}

		return orderItemData;
	});

	await tx.orderItem.createMany({
		data: orderItemsData,
	});
};

const updateRequestItems = async (
	tx: Prisma.TransactionClient,
	items: CreateDeliveryOrder["items"],
) => {
	for (const item of items) {
		if (item.requestItemId) {
			const requestItem = await tx.requestItem.findUnique({
				where: { id: item.requestItemId },
				select: {
					deliveredQuantity: true,
					requestedQuantity: true,
					approvedQuantity: true,
				},
			});

			if (!requestItem) {
				throw new Error(`Request item ${item.requestItemId} not found during update`);
			}

			const newDeliveredQuantity =
				(requestItem.deliveredQuantity || 0) + (item.quantity || 0);
			const approvedQty = requestItem.approvedQuantity || requestItem.requestedQuantity;

			let itemStatus: "pending" | "partial" | "delivered" = "pending";
			if (newDeliveredQuantity >= approvedQty) {
				itemStatus = "delivered";
			} else if (newDeliveredQuantity > 0) {
				itemStatus = "partial";
			}

			await tx.requestItem.update({
				where: { id: item.requestItemId },
				data: {
					approvedQuantity: approvedQty,
					...(newDeliveredQuantity > 0
						? { deliveredQuantity: newDeliveredQuantity }
						: {}),
					itemStatus: itemStatus,
					notes: item.notes || undefined,
				},
			});
		}
	}
};

const updateDeliveryRequestStatus = async (
	tx: Prisma.TransactionClient,
	deliveryRequestId: string,
) => {
	const updatedRequestItems = await tx.requestItem.findMany({
		where: {
			requestId: deliveryRequestId,
			isDeleted: false,
		},
		select: {
			deliveredQuantity: true,
			approvedQuantity: true,
			requestedQuantity: true,
		},
	});

	const allItemsDelivered = updatedRequestItems.every((item) => {
		const approvedQty = item.approvedQuantity || item.requestedQuantity;
		const deliveredQty = item.deliveredQuantity || 0;
		return deliveredQty >= approvedQty;
	});

	const anyItemsDelivered = updatedRequestItems.some((item) => {
		return (item.deliveredQuantity || 0) > 0;
	});

	let newStatus: "partially_delivered" | "delivered" = "partially_delivered";
	if (allItemsDelivered) {
		newStatus = "delivered";
	} else if (anyItemsDelivered) {
		newStatus = "partially_delivered";
	}

	await tx.deliveryRequest.update({
		where: { id: deliveryRequestId },
		data: {
			status: newStatus,
		},
	});

	deliveryOrderLogger.info(
		`Updated delivery request ${deliveryRequestId} status to: ${newStatus}`,
	);
};

export const createWithRequest = async (
	data: CreateDeliveryOrder,
	user: { id: string; role: string; department: { id: string; code?: string } | null },
	req: AuthRequest,
	res: Response,
) => {
	const { items, deliveryRequestId, ...rest } = data;

	if (!deliveryRequestId) {
		const errorResponse = buildErrorResponse(
			"deliveryRequestId is required for type 'with_request'",
			400,
		);
		res.status(400).json(errorResponse);
		return null;
	}

	deliveryOrderLogger.info(`Creating delivery order for deliveryRequestId: ${deliveryRequestId}`);
	deliveryOrderLogger.info(`Items payload: ${JSON.stringify(items, null, 2)}`);

	const deliveryRequest = await validateDeliveryRequest(deliveryRequestId, res);
	if (!deliveryRequest) return null;

	const validRequestItems = deliveryRequest.items;

	try {
		return await prisma.$transaction(async (tx) => {
			const orderResult = await generateNextNumber(prisma, "deliveryOrder", {
				prefix: "DOR",
				digits: 4,
			});
			const sourceId = deliveryRequest.sourceId;

			const deliveryOrder = await tx.deliveryOrder.create({
				data: {
					...rest,
					orderNumber: orderResult.number,
					sequence: orderResult.sequence,
					year: orderResult.year,
					deliveryRequestId,
					sourceId: sourceId!,
					type: "with_request",
				},
			});

			await createOrderItems(tx, items, validRequestItems, deliveryOrder.id);

			await updateRequestItems(tx, items);

			await updateDeliveryRequestStatus(tx, deliveryRequestId);

			const createdOrder = await tx.deliveryOrder.findUnique({
				where: { id: deliveryOrder.id },
				include: {
					items: {
						include: {
							product: {
								select: {
									id: true,
									name: true,
									sku: true,
								},
							},
							requestItem: {
								select: {
									id: true,
									requestedQuantity: true,
									approvedQuantity: true,
									deliveredQuantity: true,
								},
							},
						},
					},
				},
			});

			if (!createdOrder) {
				throw new Error("Failed to retrieve created delivery order");
			}

			// Create transaction record for this delivery order (type "out" for outgoing stock)
			// Get source department information
			const sourceDepartment = await tx.department.findUnique({
				where: { id: sourceId! },
			});

			if (sourceDepartment && createdOrder) {
				try {
					// Debug logging to check the items structure
					deliveryOrderLogger.info(
						`Created order items count: ${createdOrder.items?.length || 0}`,
					);
					deliveryOrderLogger.info(
						`Created order items structure: ${JSON.stringify(createdOrder.items, null, 2)}`,
					);

					const transactionData = {
						performedById: user.id,
						sourceId: sourceId!,
						destinationId: deliveryRequest.destinationId,
						referenceNumber: deliveryOrder.orderNumber,
						sourceType: "department" as const,
						type: "out" as const,
					};

					// Format the reference entity to match the expected structure
					// The createTransaction function expects items with product nested directly
					const referenceEntity = {
						items: createdOrder.items,
					};

					deliveryOrderLogger.info(
						`Reference entity for transaction: ${JSON.stringify(referenceEntity, null, 2)}`,
					);

					await createTransaction(
						tx as any,
						transactionData,
						sourceDepartment.code,
						referenceEntity,
						req,
					);
					deliveryOrderLogger.info(
						`Transaction created for delivery order: ${deliveryOrder.id}`,
					);
				} catch (transactionError) {
					deliveryOrderLogger.error(`Failed to create transaction:`, transactionError);
					// Don't fail the entire request if transaction creation fails
				}
			}

			return createdOrder;
		});
	} catch (error) {
		deliveryOrderLogger.error(`Transaction failed in createWithRequest: ${error}`);
		throw error;
	}
};

const validateItemsForWithoutRequest = (
	items: CreateDeliveryOrder["items"],
	isPPPMGSuperadmin: boolean,
	res: Response,
) => {
	if (!isPPPMGSuperadmin) {
		for (const item of items) {
			if (!item.productId) {
				const errorResponse = buildErrorResponse(
					"productId is required for each item in 'without_request' type",
					400,
				);
				res.status(400).json(errorResponse);
				return false;
			}
			if (!item.asp || item.asp === 0) {
				const errorResponse = buildErrorResponse(
					`ASP (Average Selling Price) is required and must be greater than zero for productId: ${item.productId}`,
					400,
				);
				res.status(400).json(errorResponse);
				return false;
			}
		}
	}
	return true;
};

export const createBatchForPPPMG = async (batchNumber: string, departmentId: string) => {
	try {
		const batch = await prisma.batch.upsert({
			where: {
				batchNumber: batchNumber,
				departmentId: departmentId,
			},
			update: {
				date: new Date(),
				updatedAt: new Date(),
			},
			create: {
				departmentId: departmentId,
				batchNumber: batchNumber,
				date: new Date(),
			},
		});

		deliveryOrderLogger.info(
			`Batch ${batch.id} - ${batch.batchNumber} ${batch.createdAt.getTime() === batch.updatedAt.getTime() ? "created" : "updated"}`,
		);
		return batch;
	} catch (error) {
		deliveryOrderLogger.error(`Failed to upsert batch: ${error}`);
		throw error;
	}
};

const createOrderItemsWithoutRequest = async (
	tx: Prisma.TransactionClient,
	items: CreateDeliveryOrder["items"],
	deliveryOrderId: string,
	isPPPMGSuperadmin: boolean,
) => {
	const orderItemsData = await Promise.all(
		items.map(async (item) => {
			if (!item.productId) {
				throw new Error("productId is required for each item");
			}

			const orderItemData: Prisma.OrderItemCreateManyInput = {
				productId: item.productId!,
				quantity: item.quantity,
				orderId: deliveryOrderId,
				asp: item.asp || 0,
				expiryDate: item.expiryDate ?? undefined,
			};

			if (item.batchNumber) {
				orderItemData.batchNumber = item.batchNumber;
			}

			if (item.notes) {
				orderItemData.notes = item.notes;
			}

			if (!isPPPMGSuperadmin && item.asp) {
				orderItemData.asp = item.asp;
			}

			return orderItemData;
		}),
	);

	await tx.orderItem.createMany({
		data: orderItemsData,
	});
};

const updateSupplierItems = async (
	tx: Prisma.TransactionClient,
	supplierId: string,
	items: CreateDeliveryOrder["items"],
) => {
	const uniqueProductIds = [
		...new Set(items.map((item) => item.productId).filter((id): id is string => !!id)),
	];

	const existingSupplierItems = await tx.supplierItem.findMany({
		where: {
			supplierId,
			productId: { in: uniqueProductIds },
		},
		select: { productId: true },
	});

	const existingProductIds = new Set(existingSupplierItems.map((si) => si.productId));

	const newSupplierItems = uniqueProductIds
		.filter((productId) => !existingProductIds.has(productId))
		.map((productId) => ({
			supplierId,
			productId,
		}));

	if (newSupplierItems.length > 0) {
		await tx.supplierItem.createMany({
			data: newSupplierItems,
		});
		deliveryOrderLogger.info(`Created ${newSupplierItems.length} new supplier items`);
	}
};
type UserWithDepartment = {
	id: string;
	role: Role;
	subRole: SubRole | null;
	department: {
		id: string;
		name: string;
		code: string;
	} | null;
};

export const createWithoutRequest = async (
	data: CreateDeliveryOrder,
	user: UserWithDepartment,
	req: AuthRequest,
	res: Response,
) => {
	const { items, sourceId, destinationId, ...rest } = data;

	if (!sourceId) {
		const errorResponse = buildErrorResponse(
			"Either supplierId or sourceId is required for type 'without_request'",
			400,
		);
		res.status(400).json(errorResponse);
		return null;
	}

	if (!destinationId) {
		const errorResponse = buildErrorResponse(
			"destinationId is required for type 'without_request'",
			400,
		);
		res.status(400).json(errorResponse);
		return null;
	}

	const isPPPMGSuperadmin =
		user.department?.code === "PPPMG" && user.role === "admin" && user.subRole === "super";

	if (rest.sourceType === "department") {
		if (user.department?.id !== sourceId && !isPPPMGSuperadmin) {
			const errorResponse = buildErrorResponse(
				"You can only create delivery orders from your own department",
				403,
			);
			res.status(403).json(errorResponse);
			return null;
		}

		if (sourceId === destinationId) {
			const errorResponse = buildErrorResponse(
				"Source and destination departments cannot be the same",
				400,
			);
			res.status(400).json(errorResponse);
			return null;
		}
	}

	if (rest.sourceType === "supplier") {
		if (user.department?.id !== destinationId && !isPPPMGSuperadmin) {
			const errorResponse = buildErrorResponse(
				"You can only create supplier delivery orders for your own department",
				403,
			);
			res.status(403).json(errorResponse);
			return null;
		}
	}

	if (isPPPMGSuperadmin) {
		validateItemsForWithoutRequest(items, isPPPMGSuperadmin, res);
	}

	try {
		return await prisma.$transaction(async (tx) => {
			let sourceDepartment: Department | Supplier | null = null;
			const orderResult = await generateNextNumber(prisma, "deliveryOrder", {
				prefix: "DOR",
				digits: 4,
			});

			const deliveryOrder = await tx.deliveryOrder.create({
				data: {
					...rest,
					orderNumber: orderResult.number,
					destinationId: destinationId,
					sequence: orderResult.sequence,
					year: orderResult.year,
					sourceId: sourceId!,
					type: "without_request",
				},
			});

			await createOrderItemsWithoutRequest(tx, items, deliveryOrder.id, isPPPMGSuperadmin);

			if (data.sourceType === "supplier" && sourceId) {
				await updateSupplierItems(tx, sourceId, items);

				sourceDepartment = await tx.supplier.findUnique({
					where: { id: sourceId! },
				});
			}

			const createdOrder = await tx.deliveryOrder.findUnique({
				where: { id: deliveryOrder.id },
				include: {
					items: {
						include: {
							product: {
								select: {
									id: true,
									name: true,
									sku: true,
								},
							},
						},
					},
				},
			});

			if (!createdOrder) {
				throw new Error("Failed to retrieve created delivery order");
			}

			// Create transaction record for this delivery order (type "out" for outgoing stock)
			if (rest.sourceType === "department" && sourceDepartment && createdOrder) {
				// Decrement stock for each item in the order

				try {
					const transactionData = {
						performedById: user.id,
						sourceId: sourceId!,
						destinationId: destinationId,
						referenceNumber: deliveryOrder.orderNumber,
						sourceType: rest.sourceType,
						type: "out" as const,
					};

					// Format the reference entity to match the expected structure
					// The createTransaction function expects items with product nested directly
					const referenceEntity = {
						items: createdOrder.items,
					};

					await createTransaction(
						tx as any,
						transactionData,
						sourceDepartment.code,
						referenceEntity,
						req,
					);
					deliveryOrderLogger.info(
						`Transaction created for delivery order: ${deliveryOrder.id}`,
					);
				} catch (transactionError) {
					deliveryOrderLogger.error(`Failed to create transaction:`, transactionError);
					// Don't fail the entire request if transaction creation fails
				}
			}

			return { ...createdOrder, sourceDepartment };
		});
	} catch (error) {
		deliveryOrderLogger.error(`Transaction failed in createWithoutRequest: ${error}`);
		throw error;
	}
};
