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
import { CreateSupplierItemSchema, UpdateSupplierItemSchema } from "../../zod/supplierItem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const supplierItemLogger = logger.child({ module: "supplierItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			supplierItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			supplierItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateSupplierItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			supplierItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const supplierItem = await prisma.supplierItem.create({ data: validation.data });
			supplierItemLogger.info(`SupplierItem created successfully: ${supplierItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SUPPLIERITEM.ACTIONS.CREATE_SUPPLIERITEM,
				description: `${config.ACTIVITY_LOG.SUPPLIERITEM.DESCRIPTIONS.SUPPLIERITEM_CREATED}: ${supplierItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SUPPLIERITEM.PAGES.SUPPLIERITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SUPPLIERITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SUPPLIERITEM,
				entityId: supplierItem.id,
				changesBefore: null,
				changesAfter: {
					id: supplierItem.id,
					createdAt: supplierItem.createdAt,
					updatedAt: supplierItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.SUPPLIERITEM.DESCRIPTIONS.SUPPLIERITEM_CREATED}: ${supplierItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:supplierItem:list:*");
				supplierItemLogger.info("SupplierItem list cache invalidated after creation");
			} catch (cacheError) {
				supplierItemLogger.warn(
					"Failed to invalidate cache after supplierItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIERITEM.CREATED,
				supplierItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, supplierItemLogger);

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

		supplierItemLogger.info(
			`Getting supplierItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.SupplierItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("SupplierItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("SupplierItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [supplierItems, total] = await Promise.all([
				document ? prisma.supplierItem.findMany(findManyQuery) : [],
				count ? prisma.supplierItem.count({ where: whereClause }) : 0,
			]);

			supplierItemLogger.info(`Retrieved ${supplierItems.length} supplierItems`);
			const processedData =
				groupBy && document
					? groupDataByField(supplierItems, groupBy as string)
					: supplierItems;

			const responseData: Record<string, any> = {
				...(document && { supplierItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SUPPLIERITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.GET_ALL_FAILED}: ${error}`);
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
				supplierItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				supplierItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			supplierItemLogger.info(`${config.SUCCESS.SUPPLIERITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:supplierItem:byId:${id}:${fields || "full"}`;
			let supplierItem = null;

			try {
				if (redisClient.isClientConnected()) {
					supplierItem = await redisClient.getJSON(cacheKey);
					if (supplierItem) {
						supplierItemLogger.info(
							`SupplierItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				supplierItemLogger.warn(
					`Redis cache retrieval failed for supplierItem ${id}:`,
					cacheError,
				);
			}

			if (!supplierItem) {
				const query: Prisma.SupplierItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				supplierItem = await prisma.supplierItem.findFirst(query);

				if (supplierItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, supplierItem, 3600);
						supplierItemLogger.info(`SupplierItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						supplierItemLogger.warn(
							`Failed to store supplierItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!supplierItem) {
				supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SUPPLIERITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			supplierItemLogger.info(
				`${config.SUCCESS.SUPPLIERITEM.RETRIEVED}: ${(supplierItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIERITEM.RETRIEVED,
				supplierItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.ERROR_GETTING}: ${error}`);
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
				supplierItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSupplierItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				supplierItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				supplierItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			supplierItemLogger.info(`Updating supplierItem: ${id}`);

			const existingSupplierItem = await prisma.supplierItem.findFirst({
				where: { id },
			});

			if (!existingSupplierItem) {
				supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SUPPLIERITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedSupplierItem = await prisma.supplierItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:supplierItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:supplierItem:list:*");
				supplierItemLogger.info(`Cache invalidated after supplierItem ${id} update`);
			} catch (cacheError) {
				supplierItemLogger.warn(
					"Failed to invalidate cache after supplierItem update:",
					cacheError,
				);
			}

			supplierItemLogger.info(
				`${config.SUCCESS.SUPPLIERITEM.UPDATED}: ${updatedSupplierItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIERITEM.UPDATED,
				{ supplierItem: updatedSupplierItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.ERROR_UPDATING}: ${error}`);
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
				supplierItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			supplierItemLogger.info(`${config.SUCCESS.SUPPLIERITEM.DELETED}: ${id}`);

			const existingSupplierItem = await prisma.supplierItem.findFirst({
				where: { id },
			});

			if (!existingSupplierItem) {
				supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SUPPLIERITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.supplierItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:supplierItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:supplierItem:list:*");
				supplierItemLogger.info(`Cache invalidated after supplierItem ${id} deletion`);
			} catch (cacheError) {
				supplierItemLogger.warn(
					"Failed to invalidate cache after supplierItem deletion:",
					cacheError,
				);
			}

			supplierItemLogger.info(`${config.SUCCESS.SUPPLIERITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIERITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			supplierItemLogger.error(`${config.ERROR.SUPPLIERITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
