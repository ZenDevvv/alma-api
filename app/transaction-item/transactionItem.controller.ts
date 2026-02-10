import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
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
	CreateTransactionItemSchema,
	UpdateTransactionItemSchema,
} from "../../zod/transactionItem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const transactionItemLogger = logger.child({ module: "transactionItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			transactionItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			transactionItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateTransactionItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			transactionItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const transactionItem = await prisma.transactionItem.create({ data: validation.data });
			transactionItemLogger.info(
				`TransactionItem created successfully: ${transactionItem.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TRANSACTIONITEM.ACTIONS.CREATE_TRANSACTIONITEM,
				description: `${config.ACTIVITY_LOG.TRANSACTIONITEM.DESCRIPTIONS.TRANSACTIONITEM_CREATED}: ${transactionItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TRANSACTIONITEM.PAGES.TRANSACTIONITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TRANSACTIONITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TRANSACTIONITEM,
				entityId: transactionItem.id,
				changesBefore: null,
				changesAfter: {
					id: transactionItem.id,

					createdAt: transactionItem.createdAt,
					updatedAt: transactionItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.TRANSACTIONITEM.DESCRIPTIONS.TRANSACTIONITEM_CREATED}: ${transactionItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:transactionItem:list:*");
				transactionItemLogger.info("TransactionItem list cache invalidated after creation");
			} catch (cacheError) {
				transactionItemLogger.warn(
					"Failed to invalidate cache after transactionItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTIONITEM.CREATED,
				transactionItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, transactionItemLogger);

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

		transactionItemLogger.info(
			`Getting transactionItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TransactionItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"TransactionItem",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("TransactionItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [transactionItems, total] = await Promise.all([
				document ? prisma.transactionItem.findMany(findManyQuery) : [],
				count ? prisma.transactionItem.count({ where: whereClause }) : 0,
			]);

			transactionItemLogger.info(`Retrieved ${transactionItems.length} transactionItems`);
			const processedData =
				groupBy && document
					? groupDataByField(transactionItems, groupBy as string)
					: transactionItems;

			const responseData: Record<string, any> = {
				...(document && { transactionItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.TRANSACTIONITEM.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.GET_ALL_FAILED}: ${error}`);
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
				transactionItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				transactionItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			transactionItemLogger.info(`${config.SUCCESS.TRANSACTIONITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:transactionItem:byId:${id}:${fields || "full"}`;
			let transactionItem = null;

			try {
				if (redisClient.isClientConnected()) {
					transactionItem = await redisClient.getJSON(cacheKey);
					if (transactionItem) {
						transactionItemLogger.info(
							`TransactionItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				transactionItemLogger.warn(
					`Redis cache retrieval failed for transactionItem ${id}:`,
					cacheError,
				);
			}

			if (!transactionItem) {
				const query: Prisma.TransactionItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				transactionItem = await prisma.transactionItem.findFirst(query);

				if (transactionItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, transactionItem, 3600);
						transactionItemLogger.info(
							`TransactionItem ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						transactionItemLogger.warn(
							`Failed to store transactionItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!transactionItem) {
				transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.TRANSACTIONITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			transactionItemLogger.info(
				`${config.SUCCESS.TRANSACTIONITEM.RETRIEVED}: ${(transactionItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTIONITEM.RETRIEVED,
				transactionItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.ERROR_GETTING}: ${error}`);
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
				transactionItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTransactionItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				transactionItemLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				transactionItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			transactionItemLogger.info(`Updating transactionItem: ${id}`);

			const existingTransactionItem = await prisma.transactionItem.findFirst({
				where: { id },
			});

			if (!existingTransactionItem) {
				transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.TRANSACTIONITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedTransactionItem = await prisma.transactionItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:transactionItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transactionItem:list:*");
				transactionItemLogger.info(`Cache invalidated after transactionItem ${id} update`);
			} catch (cacheError) {
				transactionItemLogger.warn(
					"Failed to invalidate cache after transactionItem update:",
					cacheError,
				);
			}

			transactionItemLogger.info(
				`${config.SUCCESS.TRANSACTIONITEM.UPDATED}: ${updatedTransactionItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTIONITEM.UPDATED,
				{ transactionItem: updatedTransactionItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.ERROR_UPDATING}: ${error}`);
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
				transactionItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			transactionItemLogger.info(`${config.SUCCESS.TRANSACTIONITEM.DELETED}: ${id}`);

			const existingTransactionItem = await prisma.transactionItem.findFirst({
				where: { id },
			});

			if (!existingTransactionItem) {
				transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.TRANSACTIONITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.transactionItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:transactionItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:transactionItem:list:*");
				transactionItemLogger.info(
					`Cache invalidated after transactionItem ${id} deletion`,
				);
			} catch (cacheError) {
				transactionItemLogger.warn(
					"Failed to invalidate cache after transactionItem deletion:",
					cacheError,
				);
			}

			transactionItemLogger.info(`${config.SUCCESS.TRANSACTIONITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TRANSACTIONITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			transactionItemLogger.error(`${config.ERROR.TRANSACTIONITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
