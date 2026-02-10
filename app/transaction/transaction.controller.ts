import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { generateNextNumber } from "../../helper/generateDeliverCode";
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
import { CreateTransactionSchema, UpdateTransactionSchema } from "../../zod/transaction.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { performStockAdjustment } from "../../helper/perform-stock-adjustment";
import { createTransaction } from "../../helper/create-transaction";

const logger = getLogger();
const transactionLogger = logger.child({ module: "transaction" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			transactionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			transactionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		try {
			// Validate request data
			const validation = CreateTransactionSchema.safeParse(requestData);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				transactionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const { performedById, sourceId, destinationId, referenceId, type } = validation.data;

			// Validate relations: Check existence of referenced entities
			const [performedBy, sourceDept, destinationDept] = await Promise.all([
				prisma.user.findUnique({ where: { id: performedById } }),
				prisma.department.findUnique({ where: { id: sourceId } }),
				prisma.department.findUnique({ where: { id: destinationId } }),
			]);

			if (!performedBy) {
				transactionLogger.error(`Invalid performedById: ${performedById}`);
				const errorResponse = buildErrorResponse("Invalid performedById: User not found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!sourceDept) {
				transactionLogger.error(`Invalid sourceId: ${sourceId}`);
				const errorResponse = buildErrorResponse("Invalid sourceId: Department not found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!destinationDept) {
				transactionLogger.error(`Invalid destinationId: ${destinationId}`);
				const errorResponse = buildErrorResponse("Invalid destinationId: Department not found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate reference based on transaction type
			let referenceEntity: any = null;
			if (type === "in") {
				referenceEntity = await prisma.deliveryReceipt.findUnique({
					where: { id: referenceId },
					select: {
						items: {
							select: {
								id: true,
								deliveryOrderItem: {
									select: {
										id: true,
										product: {
											select: {
												id: true,
												name: true,
												sku: true,
											},
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
				if (!referenceEntity) {
					transactionLogger.error(`Invalid reference for 'in' transaction: ${referenceId}`);
					const errorResponse = buildErrorResponse("Invalid reference: Delivery Receipt not found", 400);
					res.status(400).json(errorResponse);
					return;
				}
				transactionLogger.info(
					`Found delivery receipt for 'in' transaction: ${JSON.stringify(referenceEntity, null, 2)}`,
				);
			} else if (type === "out") {
				referenceEntity = await prisma.deliveryOrder.findUnique({
					where: { id: referenceId },
				});
				if (!referenceEntity) {
					transactionLogger.error(`Invalid reference for 'out' transaction: ${referenceId}`);
					const errorResponse = buildErrorResponse("Invalid reference: Delivery Order not found", 400);
					res.status(400).json(errorResponse);
					return;
				}
			}
			// For 'adjustment', reference validation is skipped (or extend as needed)

			transactionLogger.info(`All relations validated successfully for transaction creation`);

			const transaction = await createTransaction(prisma, validation.data, sourceDept.code, referenceEntity, req);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTION.CREATED,
				transaction,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error: any) {
			transactionLogger.error(`${config.ERROR.TRANSACTION.CREATE_FAILED}: ${error.message}`);
			// Send a more specific error message if available from the helper
			const statusCode =
				error.message.includes("not found") || error.message.includes("Invalid") ? 400 : 500;
			const errorResponse = buildErrorResponse(
				error.message || config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				statusCode,
			);
			res.status(statusCode).json(errorResponse);
		}
	};
	
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, transactionLogger);

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

		transactionLogger.info(
			`Getting transactions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TransactionWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Transaction", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Transaction", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [transactions, total] = await Promise.all([
				document ? prisma.transaction.findMany(findManyQuery) : [],
				count ? prisma.transaction.count({ where: whereClause }) : 0,
			]);

			transactionLogger.info(`Retrieved ${transactions.length} transactions`);
			const processedData =
				groupBy && document
					? groupDataByField(transactions, groupBy as string)
					: transactions;

			const responseData: Record<string, any> = {
				...(document && { transactions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.TRANSACTION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			transactionLogger.error(`${config.ERROR.TRANSACTION.GET_ALL_FAILED}: ${error}`);
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
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				transactionLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			transactionLogger.info(`${config.SUCCESS.TRANSACTION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:transaction:byId:${id}:${fields || "full"}`;
			let transaction = null;
			let transactionSource = null;

			try {
				if (redisClient.isClientConnected()) {
					transaction = await redisClient.getJSON(cacheKey);
					if (transaction) {
						transactionLogger.info(
							`Transaction ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				transactionLogger.warn(
					`Redis cache retrieval failed for transaction ${id}:`,
					cacheError,
				);
			}

			if (!transaction) {
				const query: Prisma.TransactionFindFirstArgs = {
					where: { id },
				};

				if (fields) {
					query.select = getNestedFields(fields);
					if (query.select) {
						query.select.sourceType = true;
						query.select.sourceId = true;
					}
				}

				transaction = await prisma.transaction.findFirst(query);

				if (transaction) {
					if (transaction.sourceType === "department") {
						transactionSource = await prisma.department.findFirst({
							where: { id: transaction.sourceId },
						});
					} else if (transaction.sourceType === "supplier") {
						transactionSource = await prisma.supplier.findFirst({
							where: { id: transaction.sourceId },
						});
					}
				}

				if (transaction && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, transaction, 3600);
						transactionLogger.info(`Transaction ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						transactionLogger.warn(
							`Failed to store transaction ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!transaction) {
				transactionLogger.error(`${config.ERROR.TRANSACTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TRANSACTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			transactionLogger.info(
				`${config.SUCCESS.TRANSACTION.RETRIEVED}: ${(transaction as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTION.RETRIEVED,
				{ ...transaction, source: transactionSource },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`${config.ERROR.TRANSACTION.ERROR_GETTING}: ${error}`);
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
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTransactionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				transactionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				transactionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			transactionLogger.info(`Updating transaction: ${id}`);

			const existingTransaction = await prisma.transaction.findFirst({
				where: { id },
			});

			if (!existingTransaction) {
				transactionLogger.error(`${config.ERROR.TRANSACTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TRANSACTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedTransaction = await prisma.transaction.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:transaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transaction:list:*");
				transactionLogger.info(`Cache invalidated after transaction ${id} update`);
			} catch (cacheError) {
				transactionLogger.warn(
					"Failed to invalidate cache after transaction update:",
					cacheError,
				);
			}

			transactionLogger.info(
				`${config.SUCCESS.TRANSACTION.UPDATED}: ${updatedTransaction.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTION.UPDATED,
				{ transaction: updatedTransaction },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`${config.ERROR.TRANSACTION.ERROR_UPDATING}: ${error}`);
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
				transactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			transactionLogger.info(`${config.SUCCESS.TRANSACTION.DELETED}: ${id}`);

			const existingTransaction = await prisma.transaction.findFirst({
				where: { id },
			});

			if (!existingTransaction) {
				transactionLogger.error(`${config.ERROR.TRANSACTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TRANSACTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.transaction.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:transaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transaction:list:*");
				transactionLogger.info(`Cache invalidated after transaction ${id} deletion`);
			} catch (cacheError) {
				transactionLogger.warn(
					"Failed to invalidate cache after transaction deletion:",
					cacheError,
				);
			}

			transactionLogger.info(`${config.SUCCESS.TRANSACTION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionLogger.error(`${config.ERROR.TRANSACTION.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
