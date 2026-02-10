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
import { CreateDeliveryItemSchema, UpdateDeliveryItemSchema } from "../../zod/request-item-zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";

const logger = getLogger();
const deliveryItemLogger = logger.child({ module: "deliveryItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deliveryItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deliveryItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeliveryItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			deliveryItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const deliveryItem = await prisma.requestItem.create({ data: validation.data });
			deliveryItemLogger.info(`DeliveryItem created successfully: ${deliveryItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DELIVERYITEM.ACTIONS.CREATE_DELIVERYITEM,
				description: `${config.ACTIVITY_LOG.DELIVERYITEM.DESCRIPTIONS.DELIVERYITEM_CREATED}: ${deliveryItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DELIVERYITEM.PAGES.DELIVERYITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DELIVERYITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DELIVERYITEM,
				entityId: deliveryItem.id,
				changesBefore: null,
				changesAfter: {
					id: deliveryItem.id,
					createdAt: deliveryItem.createdAt,
					updatedAt: deliveryItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.DELIVERYITEM.DESCRIPTIONS.DELIVERYITEM_CREATED}: ${deliveryItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:deliveryItem:list:*");
				deliveryItemLogger.info("DeliveryItem list cache invalidated after creation");
			} catch (cacheError) {
				deliveryItemLogger.warn(
					"Failed to invalidate cache after deliveryItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYITEM.CREATED,
				deliveryItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deliveryItemLogger);

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

		deliveryItemLogger.info(
			`Getting deliveryItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.RequestItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("DeliveryItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DeliveryItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [deliveryItems, total] = await Promise.all([
				document ? prisma.requestItem.findMany(findManyQuery) : [],
				count ? prisma.requestItem.count({ where: whereClause }) : 0,
			]);

			deliveryItemLogger.info(`Retrieved ${deliveryItems.length} deliveryItems`);
			const processedData =
				groupBy && document
					? groupDataByField(deliveryItems, groupBy as string)
					: deliveryItems;

			const responseData: Record<string, any> = {
				...(document && { deliveryItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DELIVERYITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.GET_ALL_FAILED}: ${error}`);
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
				deliveryItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deliveryItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryItemLogger.info(`${config.SUCCESS.DELIVERYITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:deliveryItem:byId:${id}:${fields || "full"}`;
			let deliveryItem = null;

			try {
				if (redisClient.isClientConnected()) {
					deliveryItem = await redisClient.getJSON(cacheKey);
					if (deliveryItem) {
						deliveryItemLogger.info(
							`DeliveryItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				deliveryItemLogger.warn(
					`Redis cache retrieval failed for deliveryItem ${id}:`,
					cacheError,
				);
			}

			if (!deliveryItem) {
				const query: Prisma.RequestItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				deliveryItem = await prisma.requestItem.findFirst(query);

				if (deliveryItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, deliveryItem, 3600);
						deliveryItemLogger.info(`DeliveryItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						deliveryItemLogger.warn(
							`Failed to store deliveryItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!deliveryItem) {
				deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERYITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			deliveryItemLogger.info(
				`${config.SUCCESS.DELIVERYITEM.RETRIEVED}: ${(deliveryItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYITEM.RETRIEVED,
				deliveryItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.ERROR_GETTING}: ${error}`);
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
				deliveryItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeliveryItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deliveryItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deliveryItemLogger.info(`Updating deliveryItem: ${id}`);

			const existingDeliveryItem = await prisma.requestItem.findFirst({
				where: { id },
			});

			if (!existingDeliveryItem) {
				deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERYITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedDeliveryItem = await prisma.requestItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryItem:list:*");
				deliveryItemLogger.info(`Cache invalidated after deliveryItem ${id} update`);
			} catch (cacheError) {
				deliveryItemLogger.warn(
					"Failed to invalidate cache after deliveryItem update:",
					cacheError,
				);
			}

			deliveryItemLogger.info(
				`${config.SUCCESS.DELIVERYITEM.UPDATED}: ${updatedDeliveryItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYITEM.UPDATED,
				{ deliveryItem: updatedDeliveryItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const bulkUpdate = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const updates = req.body;

			// Validate payload
			if (!Array.isArray(updates) || updates.length === 0) {
				const errorResponse = buildErrorResponse(
					"Invalid payload. Expected an array of updates.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate each item has an id
			const invalidItems = updates.filter((item) => !item.id);
			if (invalidItems.length > 0) {
				const errorResponse = buildErrorResponse("All items must have an id field.", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Use Prisma transaction for atomic updates
			const results = await prisma.$transaction(
				updates.map((item) => {
					const { id, expiryDate, ...updateData } = item;

					return prisma.requestItem.update({
						where: { id },
						data: {
							...updateData,
							...(expiryDate && { expiryDate: new Date(expiryDate) }),
						},
					});
				}),
			);

			const successResponse = {
				success: true,
				message: `Successfully updated ${results.length} items`,
				data: results,
			};

			res.status(200).json(successResponse);
		} catch (error: unknown) {
			deliveryItemLogger.error(`${config.ERROR.DELIVERY.CREATE_FAILED}: ${error}`);

			// Handle Prisma-specific errors
			if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
				const errorResponse = buildErrorResponse(
					"One or more delivery items not found",
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

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
				deliveryItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryItemLogger.info(`${config.SUCCESS.DELIVERYITEM.DELETED}: ${id}`);

			const existingDeliveryItem = await prisma.requestItem.findFirst({
				where: { id },
			});

			if (!existingDeliveryItem) {
				deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERYITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.requestItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryItem:list:*");
				deliveryItemLogger.info(`Cache invalidated after deliveryItem ${id} deletion`);
			} catch (cacheError) {
				deliveryItemLogger.warn(
					"Failed to invalidate cache after deliveryItem deletion:",
					cacheError,
				);
			}

			deliveryItemLogger.info(`${config.SUCCESS.DELIVERYITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryItemLogger.error(`${config.ERROR.DELIVERYITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, bulkUpdate, remove };
};
