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
import { CreateAlertSchema, UpdateAlertSchema } from "../../zod/alert.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const alertLogger = logger.child({ module: "alert" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			alertLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			alertLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateAlertSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			alertLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const alert = await prisma.alert.create({ data: validation.data });
			alertLogger.info(`Alert created successfully: ${alert.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ALERT.ACTIONS.CREATE_ALERT,
				description: `${config.ACTIVITY_LOG.ALERT.DESCRIPTIONS.ALERT_CREATED}: ${alert.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ALERT.PAGES.ALERT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ALERT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ALERT,
				entityId: alert.id,
				changesBefore: null,
				changesAfter: {
					id: alert.id,
					createdAt: alert.createdAt,
					updatedAt: alert.updatedAt,
				},
				description: `${config.AUDIT_LOG.ALERT.DESCRIPTIONS.ALERT_CREATED}: ${alert.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:alert:list:*");
				alertLogger.info("Alert list cache invalidated after creation");
			} catch (cacheError) {
				alertLogger.warn("Failed to invalidate cache after alert creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.ALERT.CREATED, alert, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			alertLogger.error(`${config.ERROR.ALERT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, alertLogger);

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

		alertLogger.info(
			`Getting alerts, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.AlertWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Alert", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Alert", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [alerts, total] = await Promise.all([
				document ? prisma.alert.findMany(findManyQuery) : [],
				count ? prisma.alert.count({ where: whereClause }) : 0,
			]);

			alertLogger.info(`Retrieved ${alerts.length} alerts`);
			const processedData =
				groupBy && document ? groupDataByField(alerts, groupBy as string) : alerts;

			const responseData: Record<string, any> = {
				...(document && { alerts: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ALERT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			alertLogger.error(`${config.ERROR.ALERT.GET_ALL_FAILED}: ${error}`);
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
				alertLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				alertLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			alertLogger.info(`${config.SUCCESS.ALERT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:alert:byId:${id}:${fields || "full"}`;
			let alert = null;

			try {
				if (redisClient.isClientConnected()) {
					alert = await redisClient.getJSON(cacheKey);
					if (alert) {
						alertLogger.info(`Alert ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				alertLogger.warn(`Redis cache retrieval failed for alert ${id}:`, cacheError);
			}

			if (!alert) {
				const query: Prisma.AlertFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				alert = await prisma.alert.findFirst(query);

				if (alert && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, alert, 3600);
						alertLogger.info(`Alert ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						alertLogger.warn(`Failed to store alert ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!alert) {
				alertLogger.error(`${config.ERROR.ALERT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ALERT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			alertLogger.info(`${config.SUCCESS.ALERT.RETRIEVED}: ${(alert as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ALERT.RETRIEVED,
				alert,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			alertLogger.error(`${config.ERROR.ALERT.ERROR_GETTING}: ${error}`);
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
				alertLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateAlertSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				alertLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				alertLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			alertLogger.info(`Updating alert: ${id}`);

			const existingAlert = await prisma.alert.findFirst({
				where: { id },
			});

			if (!existingAlert) {
				alertLogger.error(`${config.ERROR.ALERT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ALERT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedAlert = await prisma.alert.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:alert:byId:${id}:*`);
				await invalidateCache.byPattern("cache:alert:list:*");
				alertLogger.info(`Cache invalidated after alert ${id} update`);
			} catch (cacheError) {
				alertLogger.warn("Failed to invalidate cache after alert update:", cacheError);
			}

			alertLogger.info(`${config.SUCCESS.ALERT.UPDATED}: ${updatedAlert.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ALERT.UPDATED,
				{ alert: updatedAlert },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			alertLogger.error(`${config.ERROR.ALERT.ERROR_UPDATING}: ${error}`);
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
				alertLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			alertLogger.info(`${config.SUCCESS.ALERT.DELETED}: ${id}`);

			const existingAlert = await prisma.alert.findFirst({
				where: { id },
			});

			if (!existingAlert) {
				alertLogger.error(`${config.ERROR.ALERT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ALERT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.alert.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:alert:byId:${id}:*`);
				await invalidateCache.byPattern("cache:alert:list:*");
				alertLogger.info(`Cache invalidated after alert ${id} deletion`);
			} catch (cacheError) {
				alertLogger.warn("Failed to invalidate cache after alert deletion:", cacheError);
			}

			alertLogger.info(`${config.SUCCESS.ALERT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.ALERT.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			alertLogger.error(`${config.ERROR.ALERT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
