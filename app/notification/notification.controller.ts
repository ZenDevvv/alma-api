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
import { buildErrorResponse, formatZodErrors, handlePrismaError } from "../../helper/error-handler";
import { CreateNotificationSchema, UpdateNotificationSchema } from "../../zod/notification.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const notificationLogger = logger.child({ module: "notification" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			notificationLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			notificationLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateNotificationSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const notification = await prisma.notification.create({ data: validation.data });
			notificationLogger.info(`Notification created successfully: ${notification.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.NOTIFICATION.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.NOTIFICATION.DESCRIPTIONS.CREATED}: ${notification.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.NOTIFICATION.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.NOTIFICATION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.NOTIFICATION,
				entityId: notification.id,
				changesBefore: null,
				changesAfter: {
					...notification,
				},
				description: `${config.AUDIT_LOG.NOTIFICATION.DESCRIPTIONS.CREATED}: ${notification.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info("Notification list cache invalidated after creation");
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.CREATED,
				notification,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, notificationLogger);

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

		notificationLogger.info(
			`Getting notifications, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.NotificationWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Notification", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Notification", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [notifications, total] = await Promise.all([
				document ? prisma.notification.findMany(findManyQuery) : [],
				count ? prisma.notification.count({ where: whereClause }) : 0,
			]);

			notificationLogger.info(`Retrieved ${notifications.length} notifications`);
			const processedData =
				groupBy && document
					? groupDataByField(notifications, groupBy as string)
					: notifications;

			const responseData: Record<string, any> = {
				...(document && { notifications: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.NOTIFICATION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				notificationLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:notification:byId:${id}:${fields || "full"}`;
			let notification = null;

			try {
				if (redisClient.isClientConnected()) {
					notification = await redisClient.getJSON(cacheKey);
					if (notification) {
						notificationLogger.info(
							`Notification ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				notificationLogger.warn(
					`Redis cache retrieval failed for notification ${id}:`,
					cacheError,
				);
			}

			if (!notification) {
				const query: Prisma.NotificationFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				notification = await prisma.notification.findFirst(query);
				if (notification && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, notification, 3600);
						notificationLogger.info(`Notification ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						notificationLogger.warn(
							`Failed to store notification ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!notification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			notificationLogger.info(
				`${config.SUCCESS.NOTIFICATION.RETRIEVED}: ${(notification as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.RETRIEVED,
				notification,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateNotificationSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				notificationLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			notificationLogger.info(`Updating notification: ${id}`);

			const existingNotification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!existingNotification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedNotification = await prisma.notification.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(`Cache invalidated after notification ${id} update`);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification update:",
					cacheError,
				);
			}

			notificationLogger.info(
				`${config.SUCCESS.NOTIFICATION.UPDATED}: ${updatedNotification.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.UPDATED,
				{ notification: updatedNotification },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.DELETED}: ${id}`);

			const existingNotification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!existingNotification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.notification.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(`Cache invalidated after notification ${id} deletion`);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification deletion:",
					cacheError,
				);
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
