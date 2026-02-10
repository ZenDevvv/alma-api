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
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { CreateProductTypeSchema, UpdateProductTypeSchema } from "../../zod/product-type.zod";

const logger = getLogger();
const productTypeLogger = logger.child({ module: "productType" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			productTypeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			productTypeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateProductTypeSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			productTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const productType = await prisma.productType.create({ data: validation.data });
			productTypeLogger.info(`ProductType created successfully: ${productType.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRODUCTTYPE.ACTIONS.CREATE_PRODUCTTYPE,
				description: `${config.ACTIVITY_LOG.PRODUCTTYPE.DESCRIPTIONS.PRODUCTTYPE_CREATED}: ${productType.name || productType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCTTYPE.PAGES.PRODUCTTYPE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCTTYPE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCTTYPE,
				entityId: productType.id,
				changesBefore: null,
				changesAfter: {
					id: productType.id,
					name: productType.name,
					description: productType.description,
					categoryId: productType.categoryId,
					createdAt: productType.createdAt,
					updatedAt: productType.updatedAt,
				},
				description: `${config.AUDIT_LOG.PRODUCTTYPE.DESCRIPTIONS.PRODUCTTYPE_CREATED}: ${productType.name || productType.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:productType:list:*");
				productTypeLogger.info("ProductType list cache invalidated after creation");
			} catch (cacheError) {
				productTypeLogger.warn(
					"Failed to invalidate cache after productType creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTTYPE.CREATED,
				productType,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, productTypeLogger);

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

		productTypeLogger.info(
			`Getting productTypes, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ProductTypeWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description")
			const searchFields = ["name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("ProductType", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ProductType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [productTypes, total] = await Promise.all([
				document ? prisma.productType.findMany(findManyQuery) : [],
				count ? prisma.productType.count({ where: whereClause }) : 0,
			]);

			productTypeLogger.info(`Retrieved ${productTypes.length} productTypes`);
			const processedData =
				groupBy && document
					? groupDataByField(productTypes, groupBy as string)
					: productTypes;

			const responseData: Record<string, any> = {
				...(document && { productTypes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PRODUCTTYPE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.GET_ALL_FAILED}: ${error}`);
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
				productTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				productTypeLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			productTypeLogger.info(`${config.SUCCESS.PRODUCTTYPE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:productType:byId:${id}:${fields || "full"}`;
			let productType = null;

			try {
				if (redisClient.isClientConnected()) {
					productType = await redisClient.getJSON(cacheKey);
					if (productType) {
						productTypeLogger.info(
							`ProductType ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				productTypeLogger.warn(
					`Redis cache retrieval failed for productType ${id}:`,
					cacheError,
				);
			}

			if (!productType) {
				const query: Prisma.ProductTypeFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				productType = await prisma.productType.findFirst(query);

				if (productType && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, productType, 3600);
						productTypeLogger.info(`ProductType ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						productTypeLogger.warn(
							`Failed to store productType ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!productType) {
				productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCTTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			productTypeLogger.info(
				`${config.SUCCESS.PRODUCTTYPE.RETRIEVED}: ${(productType as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTTYPE.RETRIEVED,
				productType,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.ERROR_GETTING}: ${error}`);
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
				productTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateProductTypeSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				productTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				productTypeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			productTypeLogger.info(`Updating productType: ${id}`);

			const existingProductType = await prisma.productType.findFirst({
				where: { id },
			});

			if (!existingProductType) {
				productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCTTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedProductType = await prisma.productType.update({
				where: { id },
				data: prismaData,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRODUCTTYPE.ACTIONS.UPDATE_PRODUCTTYPE,
				description: `${config.ACTIVITY_LOG.PRODUCTTYPE.DESCRIPTIONS.PRODUCTTYPE_UPDATED}: ${updatedProductType.name || updatedProductType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCTTYPE.PAGES.PRODUCTTYPE_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCTTYPE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCTTYPE,
				entityId: updatedProductType.id,
				changesBefore: {
					id: existingProductType.id,
					name: existingProductType.name,
					description: existingProductType.description,
					categoryId: existingProductType.categoryId,
					updatedAt: existingProductType.updatedAt,
				},
				changesAfter: {
					id: updatedProductType.id,
					name: updatedProductType.name,
					description: updatedProductType.description,
					categoryId: updatedProductType.categoryId,
					updatedAt: updatedProductType.updatedAt,
				},
				description: `${config.AUDIT_LOG.PRODUCTTYPE.DESCRIPTIONS.PRODUCTTYPE_UPDATED}: ${updatedProductType.name || updatedProductType.id}`,
			});

			try {
				await invalidateCache.byPattern(`cache:productType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:productType:list:*");
				productTypeLogger.info(`Cache invalidated after productType ${id} update`);
			} catch (cacheError) {
				productTypeLogger.warn(
					"Failed to invalidate cache after productType update:",
					cacheError,
				);
			}

			productTypeLogger.info(
				`${config.SUCCESS.PRODUCTTYPE.UPDATED}: ${updatedProductType.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTTYPE.UPDATED,
				{ productType: updatedProductType },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.ERROR_UPDATING}: ${error}`);
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
				productTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			productTypeLogger.info(`${config.SUCCESS.PRODUCTTYPE.DELETED}: ${id}`);

			const existingProductType = await prisma.productType.findFirst({
				where: { id },
			});

			if (!existingProductType) {
				productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCTTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.productType.update({
				where: { id },
				data: { isDeleted: true },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRODUCTTYPE.ACTIONS.DELETE_PRODUCTTYPE,
				description: `${config.ACTIVITY_LOG.PRODUCTTYPE.DESCRIPTIONS.PRODUCTTYPE_DELETED}: ${existingProductType.name || existingProductType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCTTYPE.PAGES.PRODUCTTYPE_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCTTYPE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCTTYPE,
				entityId: existingProductType.id,
				changesBefore: {
					id: existingProductType.id,
					name: existingProductType.name,
					description: existingProductType.description,
					categoryId: existingProductType.categoryId,
					isDeleted: existingProductType.isDeleted,
					updatedAt: existingProductType.updatedAt,
				},
				changesAfter: {
					id: existingProductType.id,
					name: existingProductType.name,
					description: existingProductType.description,
					categoryId: existingProductType.categoryId,
					isDeleted: true,
					updatedAt: new Date(),
				},
				description: `${config.AUDIT_LOG.PRODUCTTYPE.DESCRIPTIONS.PRODUCTTYPE_DELETED}: ${existingProductType.name || existingProductType.id}`,
			});

			try {
				await invalidateCache.byPattern(`cache:productType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:productType:list:*");
				productTypeLogger.info(`Cache invalidated after productType ${id} deletion`);
			} catch (cacheError) {
				productTypeLogger.warn(
					"Failed to invalidate cache after productType deletion:",
					cacheError,
				);
			}

			productTypeLogger.info(`${config.SUCCESS.PRODUCTTYPE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCTTYPE.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productTypeLogger.error(`${config.ERROR.PRODUCTTYPE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
