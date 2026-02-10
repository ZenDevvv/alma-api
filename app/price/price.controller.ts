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
import { CreatePriceSchema, UpdatePriceSchema } from "../../zod/price.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const priceLogger = logger.child({ module: "price" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			priceLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			priceLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreatePriceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			priceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const price = await prisma.price.create({ data: validation.data });
			priceLogger.info(`Price created successfully: ${price.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRICE.ACTIONS.CREATE_PRICE,
				description: `${config.ACTIVITY_LOG.PRICE.DESCRIPTIONS.PRICE_CREATED}: ${price.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRICE.PAGES.PRICE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PRICE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRICE,
				entityId: price.id,
				changesBefore: null,
				changesAfter: {
					id: price.id,
					createdAt: price.createdAt,
					updatedAt: price.updatedAt,
				},
				description: `${config.AUDIT_LOG.PRICE.DESCRIPTIONS.PRICE_CREATED}: ${price.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:price:list:*");
				priceLogger.info("Price list cache invalidated after creation");
			} catch (cacheError) {
				priceLogger.warn("Failed to invalidate cache after price creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.PRICE.CREATED, price, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			priceLogger.error(`${config.ERROR.PRICE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, priceLogger);

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

		priceLogger.info(
			`Getting prices, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.PriceWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Price", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Price", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [prices, total] = await Promise.all([
				document ? prisma.price.findMany(findManyQuery) : [],
				count ? prisma.price.count({ where: whereClause }) : 0,
			]);

			priceLogger.info(`Retrieved ${prices.length} prices`);
			const processedData =
				groupBy && document ? groupDataByField(prices, groupBy as string) : prices;

			const responseData: Record<string, any> = {
				...(document && { prices: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PRICE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			priceLogger.error(`${config.ERROR.PRICE.GET_ALL_FAILED}: ${error}`);
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
				priceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				priceLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			priceLogger.info(`${config.SUCCESS.PRICE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:price:byId:${id}:${fields || "full"}`;
			let price = null;

			try {
				if (redisClient.isClientConnected()) {
					price = await redisClient.getJSON(cacheKey);
					if (price) {
						priceLogger.info(`Price ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				priceLogger.warn(`Redis cache retrieval failed for price ${id}:`, cacheError);
			}

			if (!price) {
				const query: Prisma.PriceFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				price = await prisma.price.findFirst(query);

				if (price && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, price, 3600);
						priceLogger.info(`Price ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						priceLogger.warn(`Failed to store price ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!price) {
				priceLogger.error(`${config.ERROR.PRICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			priceLogger.info(`${config.SUCCESS.PRICE.RETRIEVED}: ${(price as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRICE.RETRIEVED,
				price,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			priceLogger.error(`${config.ERROR.PRICE.ERROR_GETTING}: ${error}`);
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
				priceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdatePriceSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				priceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				priceLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			priceLogger.info(`Updating price: ${id}`);

			const existingPrice = await prisma.price.findFirst({
				where: { id },
			});

			if (!existingPrice) {
				priceLogger.error(`${config.ERROR.PRICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedPrice = await prisma.price.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:price:byId:${id}:*`);
				await invalidateCache.byPattern("cache:price:list:*");
				priceLogger.info(`Cache invalidated after price ${id} update`);
			} catch (cacheError) {
				priceLogger.warn("Failed to invalidate cache after price update:", cacheError);
			}

			priceLogger.info(`${config.SUCCESS.PRICE.UPDATED}: ${updatedPrice.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRICE.UPDATED,
				{ price: updatedPrice },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			priceLogger.error(`${config.ERROR.PRICE.ERROR_UPDATING}: ${error}`);
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
				priceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			priceLogger.info(`${config.SUCCESS.PRICE.DELETED}: ${id}`);

			const existingPrice = await prisma.price.findFirst({
				where: { id },
			});

			if (!existingPrice) {
				priceLogger.error(`${config.ERROR.PRICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.price.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:price:byId:${id}:*`);
				await invalidateCache.byPattern("cache:price:list:*");
				priceLogger.info(`Cache invalidated after price ${id} deletion`);
			} catch (cacheError) {
				priceLogger.warn("Failed to invalidate cache after price deletion:", cacheError);
			}

			priceLogger.info(`${config.SUCCESS.PRICE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PRICE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			priceLogger.error(`${config.ERROR.PRICE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
