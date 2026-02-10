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
	CreateDeliveryOrderItemSchema,
	UpdateDeliveryOrderItemSchema,
} from "../../zod/order-item-zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const deliveryOrderItemLogger = logger.child({ module: "deliveryOrderItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deliveryOrderItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deliveryOrderItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeliveryOrderItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			deliveryOrderItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Clean up the data to remove undefined values that Prisma doesn't accept
			const cleanedData: any = {};
			Object.entries(validation.data).forEach(([key, value]) => {
				if (value !== undefined) {
					cleanedData[key] = value;
				}
			});

			const deliveryOrderItem = await prisma.orderItem.create({
				data: cleanedData,
			});
			deliveryOrderItemLogger.info(
				`DeliveryOrderItem created successfully: ${deliveryOrderItem.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DELIVERYORDERITEM.ACTIONS.CREATE_DELIVERYORDERITEM,
				description: `${config.ACTIVITY_LOG.DELIVERYORDERITEM.DESCRIPTIONS.DELIVERYORDERITEM_CREATED}: ${deliveryOrderItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DELIVERYORDERITEM.PAGES.DELIVERYORDERITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DELIVERYORDERITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DELIVERYORDERITEM,
				entityId: deliveryOrderItem.id,
				changesBefore: null,
				changesAfter: {
					id: deliveryOrderItem.id,

					createdAt: deliveryOrderItem.createdAt,
					updatedAt: deliveryOrderItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.DELIVERYORDERITEM.DESCRIPTIONS.DELIVERYORDERITEM_CREATED}: ${deliveryOrderItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:deliveryOrderItem:list:*");
				deliveryOrderItemLogger.info(
					"DeliveryOrderItem list cache invalidated after creation",
				);
			} catch (cacheError) {
				deliveryOrderItemLogger.warn(
					"Failed to invalidate cache after deliveryOrderItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDERITEM.CREATED,
				deliveryOrderItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			deliveryOrderItemLogger.error(
				`${config.ERROR.DELIVERYORDERITEM.CREATE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deliveryOrderItemLogger);

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

		deliveryOrderItemLogger.info(
			`Getting deliveryOrderItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.OrderItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"DeliveryOrderItem",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DeliveryOrderItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [deliveryOrderItems, total] = await Promise.all([
				document ? prisma.orderItem.findMany(findManyQuery) : [],
				count ? prisma.orderItem.count({ where: whereClause }) : 0,
			]);

			deliveryOrderItemLogger.info(
				`Retrieved ${deliveryOrderItems.length} deliveryOrderItems`,
			);
			const processedData =
				groupBy && document
					? groupDataByField(deliveryOrderItems, groupBy as string)
					: deliveryOrderItems;

			const responseData: Record<string, any> = {
				...(document && { deliveryOrderItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.DELIVERYORDERITEM.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			deliveryOrderItemLogger.error(
				`${config.ERROR.DELIVERYORDERITEM.GET_ALL_FAILED}: ${error}`,
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
				deliveryOrderItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deliveryOrderItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryOrderItemLogger.info(
				`${config.SUCCESS.DELIVERYORDERITEM.GETTING_BY_ID}: ${id}`,
			);

			const cacheKey = `cache:deliveryOrderItem:byId:${id}:${fields || "full"}`;
			let deliveryOrderItem = null;

			try {
				if (redisClient.isClientConnected()) {
					deliveryOrderItem = await redisClient.getJSON(cacheKey);
					if (deliveryOrderItem) {
						deliveryOrderItemLogger.info(
							`DeliveryOrderItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				deliveryOrderItemLogger.warn(
					`Redis cache retrieval failed for deliveryOrderItem ${id}:`,
					cacheError,
				);
			}

			if (!deliveryOrderItem) {
				const query: Prisma.OrderItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				deliveryOrderItem = await prisma.orderItem.findFirst(query);

				if (deliveryOrderItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, deliveryOrderItem, 3600);
						deliveryOrderItemLogger.info(
							`DeliveryOrderItem ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						deliveryOrderItemLogger.warn(
							`Failed to store deliveryOrderItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!deliveryOrderItem) {
				deliveryOrderItemLogger.error(`${config.ERROR.DELIVERYORDERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYORDERITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			deliveryOrderItemLogger.info(
				`${config.SUCCESS.DELIVERYORDERITEM.RETRIEVED}: ${(deliveryOrderItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDERITEM.RETRIEVED,
				deliveryOrderItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryOrderItemLogger.error(
				`${config.ERROR.DELIVERYORDERITEM.ERROR_GETTING}: ${error}`,
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
				deliveryOrderItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeliveryOrderItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deliveryOrderItemLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryOrderItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deliveryOrderItemLogger.info(`Updating deliveryOrderItem: ${id}`);

			const existingDeliveryOrderItem = await prisma.orderItem.findFirst({
				where: { id },
			});

			if (!existingDeliveryOrderItem) {
				deliveryOrderItemLogger.error(`${config.ERROR.DELIVERYORDERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYORDERITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedDeliveryOrderItem = await prisma.orderItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryOrderItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryOrderItem:list:*");
				deliveryOrderItemLogger.info(
					`Cache invalidated after deliveryOrderItem ${id} update`,
				);
			} catch (cacheError) {
				deliveryOrderItemLogger.warn(
					"Failed to invalidate cache after deliveryOrderItem update:",
					cacheError,
				);
			}

			deliveryOrderItemLogger.info(
				`${config.SUCCESS.DELIVERYORDERITEM.UPDATED}: ${updatedDeliveryOrderItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDERITEM.UPDATED,
				{ deliveryOrderItem: updatedDeliveryOrderItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryOrderItemLogger.error(
				`${config.ERROR.DELIVERYORDERITEM.ERROR_UPDATING}: ${error}`,
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
				deliveryOrderItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryOrderItemLogger.info(`${config.SUCCESS.DELIVERYORDERITEM.DELETED}: ${id}`);

			const existingDeliveryOrderItem = await prisma.orderItem.findFirst({
				where: { id },
			});

			if (!existingDeliveryOrderItem) {
				deliveryOrderItemLogger.error(`${config.ERROR.DELIVERYORDERITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYORDERITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.orderItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryOrderItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryOrderItem:list:*");
				deliveryOrderItemLogger.info(
					`Cache invalidated after deliveryOrderItem ${id} deletion`,
				);
			} catch (cacheError) {
				deliveryOrderItemLogger.warn(
					"Failed to invalidate cache after deliveryOrderItem deletion:",
					cacheError,
				);
			}

			deliveryOrderItemLogger.info(`${config.SUCCESS.DELIVERYORDERITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDERITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryOrderItemLogger.error(
				`${config.ERROR.DELIVERYORDERITEM.DELETE_FAILED}: ${error}`,
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
