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
import { CreateActivityLogSchema, UpdateActivityLogSchema } from "../../zod/activityLog.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const activityLogLogger = logger.child({ module: "activityLog" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			activityLogLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			activityLogLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateActivityLogSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			activityLogLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const activityLog = await prisma.activityLog.create({ data: validation.data });
			activityLogLogger.info(`ActivityLog created successfully: ${activityLog.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ACTIVITYLOG.ACTIONS.CREATE_ACTIVITYLOG,
				description: `${config.ACTIVITY_LOG.ACTIVITYLOG.DESCRIPTIONS.ACTIVITYLOG_CREATED}: ${activityLog.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ACTIVITYLOG.PAGES.ACTIVITYLOG_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ACTIVITYLOG,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ACTIVITYLOG,
				entityId: activityLog.id,
				changesBefore: null,
				changesAfter: {
					...activityLog,
				},
				description: `${config.AUDIT_LOG.ACTIVITYLOG.DESCRIPTIONS.ACTIVITYLOG_CREATED}: ${activityLog.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:activityLog:list:*");
				activityLogLogger.info("ActivityLog list cache invalidated after creation");
			} catch (cacheError) {
				activityLogLogger.warn(
					"Failed to invalidate cache after activityLog creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOG.CREATED,
				activityLog,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, activityLogLogger);

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

		activityLogLogger.info(
			`Getting activityLogs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ActivityLogWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["id", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("ActivityLog", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ActivityLog", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [activityLogs, total] = await Promise.all([
				document ? prisma.activityLog.findMany(findManyQuery) : [],
				count ? prisma.activityLog.count({ where: whereClause }) : 0,
			]);

			activityLogLogger.info(`Retrieved ${activityLogs.length} activityLogs`);
			const processedData =
				groupBy && document
					? groupDataByField(activityLogs, groupBy as string)
					: activityLogs;

			const responseData: Record<string, any> = {
				...(document && { activityLogs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ACTIVITYLOG.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.GET_ALL_FAILED}: ${error}`);
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
				activityLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				activityLogLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			activityLogLogger.info(`${config.SUCCESS.ACTIVITYLOG.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:activityLog:byId:${id}:${fields || "full"}`;
			let activityLog = null;

			try {
				if (redisClient.isClientConnected()) {
					activityLog = await redisClient.getJSON(cacheKey);
					if (activityLog) {
						activityLogLogger.info(
							`ActivityLog ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				activityLogLogger.warn(
					`Redis cache retrieval failed for activityLog ${id}:`,
					cacheError,
				);
			}

			if (!activityLog) {
				const query: Prisma.ActivityLogFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				activityLog = await prisma.activityLog.findFirst(query);

				if (activityLog && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, activityLog, 3600);
						activityLogLogger.info(`ActivityLog ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						activityLogLogger.warn(
							`Failed to store activityLog ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!activityLog) {
				activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ACTIVITYLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			activityLogLogger.info(
				`${config.SUCCESS.ACTIVITYLOG.RETRIEVED}: ${(activityLog as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOG.RETRIEVED,
				activityLog,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.ERROR_GETTING}: ${error}`);
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
				activityLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateActivityLogSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				activityLogLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				activityLogLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			activityLogLogger.info(`Updating activityLog: ${id}`);

			const existingActivityLog = await prisma.activityLog.findFirst({
				where: { id },
			});

			if (!existingActivityLog) {
				activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ACTIVITYLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedActivityLog = await prisma.activityLog.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:activityLog:byId:${id}:*`);
				await invalidateCache.byPattern("cache:activityLog:list:*");
				activityLogLogger.info(`Cache invalidated after activityLog ${id} update`);
			} catch (cacheError) {
				activityLogLogger.warn(
					"Failed to invalidate cache after activityLog update:",
					cacheError,
				);
			}

			activityLogLogger.info(
				`${config.SUCCESS.ACTIVITYLOG.UPDATED}: ${updatedActivityLog.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOG.UPDATED,
				{ activityLog: updatedActivityLog },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.ERROR_UPDATING}: ${error}`);
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
				activityLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			activityLogLogger.info(`${config.SUCCESS.ACTIVITYLOG.DELETED}: ${id}`);

			const existingActivityLog = await prisma.activityLog.findFirst({
				where: { id },
			});

			if (!existingActivityLog) {
				activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ACTIVITYLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.activityLog.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:activityLog:byId:${id}:*`);
				await invalidateCache.byPattern("cache:activityLog:list:*");
				activityLogLogger.info(`Cache invalidated after activityLog ${id} deletion`);
			} catch (cacheError) {
				activityLogLogger.warn(
					"Failed to invalidate cache after activityLog deletion:",
					cacheError,
				);
			}

			activityLogLogger.info(`${config.SUCCESS.ACTIVITYLOG.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOG.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			activityLogLogger.error(`${config.ERROR.ACTIVITYLOG.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
