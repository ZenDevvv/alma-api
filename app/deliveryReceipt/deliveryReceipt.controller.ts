import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma, Batch } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateDeliveryReceiptSchema,
	UpdateDeliveryReceiptSchema,
} from "../../zod/delivery-receipt-zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { PrismaClientKnownRequestError } from "../../generated/prisma/runtime/library";
import { AuthRequest } from "../../middleware/verifyToken";
import { generateUniqueCode } from "../../helper/generateDeliverCode";
import { createBatchForPPPMG } from "../../helper/request-helper";
import { createTransaction } from "../../helper/create-transaction";

const logger = getLogger();
const deliveryReceiptLogger = logger.child({ module: "deliveryReceipt" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		// Get uploaded images URLs from cloudinary results (added by middleware)
		const uploadedAttachments = req.cloudinaryResults?.map((result) => result.secure_url) || [];

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deliveryReceiptLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deliveryReceiptLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Add uploaded images to request data
		if (uploadedAttachments.length > 0) {
			requestData.attachments = uploadedAttachments;
			deliveryReceiptLogger.info(`Uploaded ${uploadedAttachments.length} attachments`);
		}

		const validation = CreateDeliveryReceiptSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			console.log("Error : ", validation);
			deliveryReceiptLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const { items: receiptItems, ...rest } = validation.data;
			const user = await prisma.user.findUnique({
				where: {
					id: req.userId,
				},
				include: {
					department: true,
				},
			});

			if (!user) {
				const errorResponse = buildErrorResponse("User Not Found", 404);
				res.status(400).json(errorResponse);
				return;
			}

			if (!user.departmentId) {
				const errorResponse = buildErrorResponse(
					"User does not have a department assigned",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const order = await prisma.deliveryOrder.findUnique({
				where: {
					id: validation.data.deliveryOrderId,
				},
				select: {
					id: true,
					sourceId: true,
					sourceType: true,
					destinationId: true,
					items: true,
					type: true,
					deliveryRequestId: true,
				},
			});

			if (!order) {
				const errorResponse = buildErrorResponse("Delivery Order Not Found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const results = await prisma.$transaction(async (tx) => {
				const currentYear = new Date().getFullYear();

				const latestOrder = await tx.deliveryReceipt.findFirst({
					where: {
						receiptNumber: {
							startsWith: `DRE-${currentYear}-`,
						},
					},
					orderBy: {
						createdAt: "desc",
					},
					select: {
						receiptNumber: true,
					},
				});

				const codeNumber = generateUniqueCode(latestOrder?.receiptNumber, "DRE");
				const deliveryReceipt = await tx.deliveryReceipt.create({
					data: {
						...rest,
						receiptNumber: codeNumber,
					},
				});

				if (user.departmentId === null) {
					throw new Error("User department ID is null");
				}

				const batchMap = new Map<string, string>();

				for (const item of order.items) {
					if (item.batchNumber && item.productId) {
						if (!batchMap.has(item.batchNumber)) {
							const batch = await createBatchForPPPMG(
								item.batchNumber,
								user.departmentId,
							);
							batchMap.set(item.batchNumber, batch.id);
						}
					}
				}

				for (const item of order.items) {
					const batchNumber = item.batchNumber ?? null;
					const productId = item.productId ?? null;
					const batchId = batchNumber ? (batchMap.get(batchNumber) ?? null) : null;

					if (!batchId || !productId) {
						const errorResponse = buildErrorResponse(
							"Batch ID or Product ID not found",
							404,
						);
						res.status(400).json(errorResponse);
					}

					if (batchId && productId) {
						const existing = await tx.stockItem.findFirst({
							where: {
								batchId: batchId,
								productId: productId,
							},
						});

						if (existing) {
							await tx.stockItem.update({
								where: { id: existing.id },
								data: {
									quantity: { increment: item.quantity },
									asp: item.asp ?? undefined,
									expiryDate: item.expiryDate ?? undefined,
								},
							});
						} else {
							await tx.stockItem.create({
								data: {
									batchId,
									productId,
									quantity: item.quantity,
									asp: item.asp ?? undefined,
									expiryDate: item.expiryDate ?? undefined,
								},
							});
						}
					}
				}

				await tx.receiptItem.createMany({
					data: receiptItems!.map((item) => ({
						...item,
						deliveryReceiptId: deliveryReceipt.id,
					})),
				});

				if (order.type === "with_request") {
					await tx.deliveryOrder.update({
						where: { id: order.id },
						data: {
							status: "delivered",
						},
					});
				}

				if (order.type !== "without_request" && order.deliveryRequestId) {
					const deliveryRequest = await tx.deliveryRequest.findUnique({
						where: { id: order.deliveryRequestId },
						include: {
							items: {
								where: { isDeleted: false },
							},
						},
					});

					if (!deliveryRequest || !deliveryRequest.items) {
						return { deliveryReceipt };
					}

					const allItemsMatch = deliveryRequest.items.every(
						(item: any) => item.deliveredQuantity === item.approvedQuantity,
					);
					if (allItemsMatch) {
						await tx.deliveryRequest.update({
							where: { id: deliveryRequest.id },
							data: {
								status: "delivered",
							},
						});
					} else {
						await tx.deliveryRequest.update({
							where: { id: deliveryRequest.id },
							data: {
								status: "partially_delivered",
							},
						});
					}
				}

				await tx.deliveryOrder.update({
					where: { id: order.id },
					data: {
						status: "delivered",
					},
				});

				return { deliveryReceipt, order };
			});

			const { deliveryReceipt, order: orderData } = results;

			if (!deliveryReceipt) {
				res.status(409).json({ status: 409, messsage: "test" });
				return;
			}

			// Create transaction record for this delivery receipt
			if (orderData) {
				try {
					const transactionData = {
						performedById: req.userId!,
						sourceId: orderData.sourceId,
						destinationId: orderData.destinationId,
						referenceNumber: deliveryReceipt.receiptNumber,
						sourceType: orderData.sourceType,
						type: "in" as const,
					};

					let sourceDept: any;
					let sourceSupplier: any;
					if (orderData.sourceType === "department") {
						sourceDept = await prisma.department.findUnique({
							where: { id: orderData.sourceId },
						});
					}
					if (orderData.sourceType === "supplier") {
						sourceSupplier = await prisma.supplier.findUnique({
							where: { id: orderData.sourceId },
						});
					}
					const source = sourceDept || sourceSupplier;

					if (source) {
						const referenceEntity = await prisma.deliveryReceipt.findUnique({
							where: { id: deliveryReceipt.id },
							select: {
								items: {
									select: {
										id: true,
										deliveryOrderItem: {
											select: {
												id: true,
												product: {
													select: { id: true, name: true, sku: true },
												},
												expiryDate: true,
												quantity: true,
												batchNumber: true,
											},
										},
									},
								},
							},
						});

						if (referenceEntity) {
							await createTransaction(
								prisma,
								transactionData,
								source.code,
								referenceEntity,
								req,
							);
							deliveryReceiptLogger.info(
								`Transaction created for receipt: ${deliveryReceipt.id}`,
							);
						} else {
							console.log("No reference entity found");
						}
					}
				} catch (transactionError) {
					deliveryReceiptLogger.error(`Failed to create transaction:`, transactionError);
					// Don't fail the entire request if transaction creation fails
				}
			}

			deliveryReceiptLogger.info(
				`DeliveryReceipt created successfully: ${deliveryReceipt.id} with ${uploadedAttachments.length} attachments`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DELIVERYRECEIPT.ACTIONS.CREATE_DELIVERYRECEIPT,
				description: `${config.ACTIVITY_LOG.DELIVERYRECEIPT.DESCRIPTIONS.DELIVERYRECEIPT_CREATED}: ${deliveryReceipt.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DELIVERYRECEIPT.PAGES.DELIVERYRECEIPT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DELIVERYRECEIPT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DELIVERYRECEIPT,
				entityId: deliveryReceipt.id,
				changesBefore: null,
				changesAfter: {
					id: deliveryReceipt.id,
					createdAt: deliveryReceipt.createdAt,
					updatedAt: deliveryReceipt.updatedAt,
				},
				description: `${config.AUDIT_LOG.DELIVERYRECEIPT.DESCRIPTIONS.DELIVERYRECEIPT_CREATED}: ${deliveryReceipt.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:deliveryReceipt:list:*");
				deliveryReceiptLogger.info("DeliveryReceipt list cache invalidated after creation");
			} catch (cacheError) {
				deliveryReceiptLogger.warn(
					"Failed to invalidate cache after deliveryReceipt creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPT.CREATED,
				deliveryReceipt,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			if (error instanceof PrismaClientKnownRequestError) {
				if (error.code === "P2002") {
					// Unique constraint violation
					const target = (error.meta?.target as string[])?.[0] || "field";

					deliveryReceiptLogger.error("Duplicate delivery receipt", {
						code: error.code,
						constraint: error.meta?.target,
						message: error.message,
					});

					res.status(409).json({
						status: 409,
						message: `Delivery receipt with this ${target} already exists`,
					});
					return;
				} else if (error.code === "P2025") {
					console.log("Prisma P2025 error encountered:", error);
					// Record not found
					res.status(404).json({
						status: 404,
						message: "Delivery receipt not found",
					});
					return;
				} else if (error.code === "P2003") {
					// Foreign key constraint
					res.status(400).json({
						status: 400,
						message: "Invalid reference in delivery receipt",
					});
					return;
				}

				deliveryReceiptLogger.error("Prisma error", {
					code: error.code,
					message: error.message,
					meta: error.meta,
				});

				res.status(500).json({
					status: 500,
					message: "Database error occurred",
				});
				return;
			}
			deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deliveryReceiptLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		deliveryReceiptLogger.info(
			`Getting deliveryReceipts, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DeliveryReceiptWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"DeliveryReceipt",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DeliveryReceipt", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			let findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			if (document && !fields) {
				findManyQuery.include = {
					deliveryRequest: true,
					deliveryOrder: true,
					receivedBy: true,
					inspectedBy: true,
				};
			}

			const [deliveryReceipts, total] = await Promise.all([
				document ? prisma.deliveryReceipt.findMany(findManyQuery) : [],
				count ? prisma.deliveryReceipt.count({ where: whereClause }) : 0,
			]);

			deliveryReceiptLogger.info(`Retrieved ${deliveryReceipts.length} deliveryReceipts`);
			const processedData =
				groupBy && document
					? groupDataByField(deliveryReceipts, groupBy as string)
					: deliveryReceipts;

			const responseData: Record<string, any> = {
				...(document && { deliveryReceipts: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.DELIVERYRECEIPT.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				deliveryReceiptLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deliveryReceiptLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryReceiptLogger.info(`${config.SUCCESS.DELIVERYRECEIPT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:deliveryReceipt:byId:${id}:${fields || "full"}`;
			let deliveryReceipt = null;
			let source = null;

			try {
				if (redisClient.isClientConnected()) {
					deliveryReceipt = await redisClient.getJSON(cacheKey);
					if (deliveryReceipt) {
						deliveryReceiptLogger.info(
							`DeliveryReceipt ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				deliveryReceiptLogger.warn(
					`Redis cache retrieval failed for deliveryReceipt ${id}:`,
					cacheError,
				);
			}

			if (!deliveryReceipt) {
				const query: Prisma.DeliveryReceiptFindFirstArgs = {
					where: { id },
				};

				if (fields) {
					query.select = getNestedFields(fields);
					if (query.select) {
						query.select.deliveryOrder = {
							select: {
								sourceId: true,
								sourceType: true,
							},
						};
					}
				}

				type DeliveryReceiptWithOrder = {
					deliveryOrder?: {
						sourceType?: string;
						sourceId?: string;
					};
				} & typeof deliveryReceipt;

				query.select = getNestedFields(fields);

				deliveryReceipt = (await prisma.deliveryReceipt.findFirst(
					query,
				)) as DeliveryReceiptWithOrder;

				const sourceType = deliveryReceipt?.deliveryOrder?.sourceType;
				const sourceId = deliveryReceipt?.deliveryOrder?.sourceId;

				if (deliveryReceipt && sourceType) {
					if (sourceType === "supplier") {
						source = await prisma.supplier.findUnique({
							where: { id: sourceId },
						});

						if (!source?.isActive) {
							throw new Error("Source supplier is not active");
						}
					} else if (sourceType === "department") {
						source = await prisma.department.findUnique({
							where: { id: sourceId },
						});

						if (!source?.isActive) {
							throw new Error("Source department is not active");
						}
					}
				}

				if (deliveryReceipt && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, deliveryReceipt, 3600);
						deliveryReceiptLogger.info(
							`DeliveryReceipt ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						deliveryReceiptLogger.warn(
							`Failed to store deliveryReceipt ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!deliveryReceipt) {
				deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYRECEIPT.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			deliveryReceiptLogger.info(
				`${config.SUCCESS.DELIVERYRECEIPT.RETRIEVED}: ${(deliveryReceipt as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPT.RETRIEVED,
				{ ...deliveryReceipt, source },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deliveryReceiptLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeliveryReceiptSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deliveryReceiptLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryReceiptLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryReceiptLogger.info(`Updating deliveryReceipt: ${id}`);

			const existingDeliveryReceipt = await prisma.deliveryReceipt.findFirst({
				where: { id },
			});

			if (!existingDeliveryReceipt) {
				deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYRECEIPT.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}
			const { items: receiptItems, ...rest } = validationResult.data;

			const updatedDeliveryReceipt = await prisma.deliveryReceipt.update({
				where: { id },
				data: rest,
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryReceipt:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryReceipt:list:*");
				deliveryReceiptLogger.info(`Cache invalidated after deliveryReceipt ${id} update`);
			} catch (cacheError) {
				deliveryReceiptLogger.warn(
					"Failed to invalidate cache after deliveryReceipt update:",
					cacheError,
				);
			}

			deliveryReceiptLogger.info(
				`${config.SUCCESS.DELIVERYRECEIPT.UPDATED}: ${updatedDeliveryReceipt.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPT.UPDATED,
				{ deliveryReceipt: updatedDeliveryReceipt },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deliveryReceiptLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryReceiptLogger.info(`${config.SUCCESS.DELIVERYRECEIPT.DELETED}: ${id}`);

			const existingDeliveryReceipt = await prisma.deliveryReceipt.findFirst({
				where: { id },
			});

			if (!existingDeliveryReceipt) {
				deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYRECEIPT.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.deliveryReceipt.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryReceipt:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryReceipt:list:*");
				deliveryReceiptLogger.info(
					`Cache invalidated after deliveryReceipt ${id} deletion`,
				);
			} catch (cacheError) {
				deliveryReceiptLogger.warn(
					"Failed to invalidate cache after deliveryReceipt deletion:",
					cacheError,
				);
			}

			deliveryReceiptLogger.info(`${config.SUCCESS.DELIVERYRECEIPT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPT.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryReceiptLogger.error(`${config.ERROR.DELIVERYRECEIPT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
