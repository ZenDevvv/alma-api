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
import { CreateStockMovementItemSchema, UpdateStockMovementItemSchema } from "../../zod/stock-item";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const stockMovementItemLogger = logger.child({ module: "stockMovementItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			stockMovementItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			stockMovementItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateStockMovementItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			stockMovementItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const stockMovementItem = await prisma.stockItem.create({
				data: validation.data,
			});
			stockMovementItemLogger.info(
				`StockMovementItem created successfully: ${stockMovementItem.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.STOCKMOVEMENTITEM.ACTIONS.CREATE_STOCKMOVEMENTITEM,
				description: `${config.ACTIVITY_LOG.STOCKMOVEMENTITEM.DESCRIPTIONS.STOCKMOVEMENTITEM_CREATED}: ${stockMovementItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.STOCKMOVEMENTITEM.PAGES.STOCKMOVEMENTITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.STOCKMOVEMENTITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.STOCKMOVEMENTITEM,
				entityId: stockMovementItem.id,
				changesBefore: null,
				changesAfter: {
					id: stockMovementItem.id,
					createdAt: stockMovementItem.createdAt,
					updatedAt: stockMovementItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.STOCKMOVEMENTITEM.DESCRIPTIONS.STOCKMOVEMENTITEM_CREATED}: ${stockMovementItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:stockMovementItem:list:*");
				stockMovementItemLogger.info(
					"StockMovementItem list cache invalidated after creation",
				);
			} catch (cacheError) {
				stockMovementItemLogger.warn(
					"Failed to invalidate cache after stockMovementItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.STOCKMOVEMENTITEM.CREATED,
				stockMovementItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			stockMovementItemLogger.error(
				`${config.ERROR.STOCKMOVEMENTITEM.CREATE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, stockMovementItemLogger);

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

		stockMovementItemLogger.info(
			`Getting stockItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.StockItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"StockItem",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("StockItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [stockMovementItems, total] = await Promise.all([
				document ? prisma.stockItem.findMany(findManyQuery) : [],
				count ? prisma.stockItem.count({ where: whereClause }) : 0,
			]);

			stockMovementItemLogger.info(
				`Retrieved ${stockMovementItems.length} stockMovementItems`,
			);
			const processedData =
				groupBy && document
					? groupDataByField(stockMovementItems, groupBy as string)
					: stockMovementItems;

			const responseData: Record<string, any> = {
				...(document && { stockMovementItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.STOCKMOVEMENTITEM.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			stockMovementItemLogger.error(
				`${config.ERROR.STOCKMOVEMENTITEM.GET_ALL_FAILED}: ${error}`,
			);
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
				stockMovementItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				stockMovementItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			stockMovementItemLogger.info(
				`${config.SUCCESS.STOCKMOVEMENTITEM.GETTING_BY_ID}: ${id}`,
			);

			const cacheKey = `cache:stockMovementItem:byId:${id}:${fields || "full"}`;
			let stockMovementItem = null;

			try {
				if (redisClient.isClientConnected()) {
					stockMovementItem = await redisClient.getJSON(cacheKey);
					if (stockMovementItem) {
						stockMovementItemLogger.info(
							`StockMovementItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				stockMovementItemLogger.warn(
					`Redis cache retrieval failed for stockMovementItem ${id}:`,
					cacheError,
				);
			}

			if (!stockMovementItem) {
				const query: Prisma.StockItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				stockMovementItem = await prisma.stockItem.findFirst(query);

				if (stockMovementItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, stockMovementItem, 3600);
						stockMovementItemLogger.info(
							`StockMovementItem ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						stockMovementItemLogger.warn(
							`Failed to store stockMovementItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!stockMovementItem) {
				stockMovementItemLogger.error(`${config.ERROR.STOCKMOVEMENTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.STOCKMOVEMENTITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			stockMovementItemLogger.info(
				`${config.SUCCESS.STOCKMOVEMENTITEM.RETRIEVED}: ${(stockMovementItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.STOCKMOVEMENTITEM.RETRIEVED,
				stockMovementItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			stockMovementItemLogger.error(
				`${config.ERROR.STOCKMOVEMENTITEM.ERROR_GETTING}: ${error}`,
			);
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
				stockMovementItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateStockMovementItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				stockMovementItemLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				stockMovementItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			stockMovementItemLogger.info(`Updating stockMovementItem: ${id}`);

			const existingStockMovementItem = await prisma.stockItem.findFirst({
				where: { id },
			});

			if (!existingStockMovementItem) {
				stockMovementItemLogger.error(`${config.ERROR.STOCKMOVEMENTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.STOCKMOVEMENTITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedStockMovementItem = await prisma.stockItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:stockMovementItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:stockMovementItem:list:*");
				stockMovementItemLogger.info(
					`Cache invalidated after stockMovementItem ${id} update`,
				);
			} catch (cacheError) {
				stockMovementItemLogger.warn(
					"Failed to invalidate cache after stockMovementItem update:",
					cacheError,
				);
			}

			stockMovementItemLogger.info(
				`${config.SUCCESS.STOCKMOVEMENTITEM.UPDATED}: ${updatedStockMovementItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.STOCKMOVEMENTITEM.UPDATED,
				{ stockMovementItem: updatedStockMovementItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			stockMovementItemLogger.error(
				`${config.ERROR.STOCKMOVEMENTITEM.ERROR_UPDATING}: ${error}`,
			);
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
				stockMovementItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			stockMovementItemLogger.info(`${config.SUCCESS.STOCKMOVEMENTITEM.DELETED}: ${id}`);

			const existingStockMovementItem = await prisma.stockItem.findFirst({
				where: { id },
			});

			if (!existingStockMovementItem) {
				stockMovementItemLogger.error(`${config.ERROR.STOCKMOVEMENTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.STOCKMOVEMENTITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.stockItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:stockMovementItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:stockMovementItem:list:*");
				stockMovementItemLogger.info(
					`Cache invalidated after stockMovementItem ${id} deletion`,
				);
			} catch (cacheError) {
				stockMovementItemLogger.warn(
					"Failed to invalidate cache after stockMovementItem deletion:",
					cacheError,
				);
			}

			stockMovementItemLogger.info(`${config.SUCCESS.STOCKMOVEMENTITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.STOCKMOVEMENTITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			stockMovementItemLogger.error(
				`${config.ERROR.STOCKMOVEMENTITEM.DELETE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
