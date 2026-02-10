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
import { CreateAuditLogSchema, UpdateAuditLogSchema } from "../../zod/auditLog.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const auditLogLogger = logger.child({ module: "auditLog" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			auditLogLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			auditLogLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateAuditLogSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			auditLogLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const auditLog = await prisma.auditLog.create({ data: validation.data });
			auditLogLogger.info(`AuditLog created successfully: ${auditLog.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AUDITLOG.ACTIONS.CREATE_AUDITLOG,
				description: `${config.ACTIVITY_LOG.AUDITLOG.DESCRIPTIONS.AUDITLOG_CREATED}: ${auditLog.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AUDITLOG.PAGES.AUDITLOG_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.AUDITLOG,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.AUDITLOG,
				entityId: auditLog.id,
				changesBefore: null,
				changesAfter: {
					...auditLog,
				},
				description: `${config.AUDIT_LOG.AUDITLOG.DESCRIPTIONS.AUDITLOG_CREATED}: ${auditLog.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:auditLog:list:*");
				auditLogLogger.info("AuditLog list cache invalidated after creation");
			} catch (cacheError) {
				auditLogLogger.warn(
					"Failed to invalidate cache after auditLog creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOG.CREATED,
				auditLog,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			auditLogLogger.error(`${config.ERROR.AUDITLOG.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, auditLogLogger);

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

		auditLogLogger.info(
			`Getting auditLogs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.AuditLogWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["id", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("AuditLog", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("AuditLog", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [auditLogs, total] = await Promise.all([
				document ? prisma.auditLog.findMany(findManyQuery) : [],
				count ? prisma.auditLog.count({ where: whereClause }) : 0,
			]);

			auditLogLogger.info(`Retrieved ${auditLogs.length} auditLogs`);
			const processedData =
				groupBy && document ? groupDataByField(auditLogs, groupBy as string) : auditLogs;

			const responseData: Record<string, any> = {
				...(document && { auditLogs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.AUDITLOG.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			auditLogLogger.error(`${config.ERROR.AUDITLOG.GET_ALL_FAILED}: ${error}`);
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
				auditLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				auditLogLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			auditLogLogger.info(`${config.SUCCESS.AUDITLOG.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:auditLog:byId:${id}:${fields || "full"}`;
			let auditLog = null;

			try {
				if (redisClient.isClientConnected()) {
					auditLog = await redisClient.getJSON(cacheKey);
					if (auditLog) {
						auditLogLogger.info(`AuditLog ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				auditLogLogger.warn(`Redis cache retrieval failed for auditLog ${id}:`, cacheError);
			}

			if (!auditLog) {
				const query: Prisma.AuditLogFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				auditLog = await prisma.auditLog.findFirst(query);

				if (auditLog && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, auditLog, 3600);
						auditLogLogger.info(`AuditLog ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						auditLogLogger.warn(
							`Failed to store auditLog ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!auditLog) {
				auditLogLogger.error(`${config.ERROR.AUDITLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AUDITLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			auditLogLogger.info(`${config.SUCCESS.AUDITLOG.RETRIEVED}: ${(auditLog as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOG.RETRIEVED,
				auditLog,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLogLogger.error(`${config.ERROR.AUDITLOG.ERROR_GETTING}: ${error}`);
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
				auditLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateAuditLogSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				auditLogLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				auditLogLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			auditLogLogger.info(`Updating auditLog: ${id}`);

			const existingAuditLog = await prisma.auditLog.findFirst({
				where: { id },
			});

			if (!existingAuditLog) {
				auditLogLogger.error(`${config.ERROR.AUDITLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AUDITLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedAuditLog = await prisma.auditLog.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:auditLog:byId:${id}:*`);
				await invalidateCache.byPattern("cache:auditLog:list:*");
				auditLogLogger.info(`Cache invalidated after auditLog ${id} update`);
			} catch (cacheError) {
				auditLogLogger.warn(
					"Failed to invalidate cache after auditLog update:",
					cacheError,
				);
			}

			auditLogLogger.info(`${config.SUCCESS.AUDITLOG.UPDATED}: ${updatedAuditLog.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOG.UPDATED,
				{ auditLog: updatedAuditLog },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLogLogger.error(`${config.ERROR.AUDITLOG.ERROR_UPDATING}: ${error}`);
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
				auditLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			auditLogLogger.info(`${config.SUCCESS.AUDITLOG.DELETED}: ${id}`);

			const existingAuditLog = await prisma.auditLog.findFirst({
				where: { id },
			});

			if (!existingAuditLog) {
				auditLogLogger.error(`${config.ERROR.AUDITLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AUDITLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.auditLog.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:auditLog:byId:${id}:*`);
				await invalidateCache.byPattern("cache:auditLog:list:*");
				auditLogLogger.info(`Cache invalidated after auditLog ${id} deletion`);
			} catch (cacheError) {
				auditLogLogger.warn(
					"Failed to invalidate cache after auditLog deletion:",
					cacheError,
				);
			}

			auditLogLogger.info(`${config.SUCCESS.AUDITLOG.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.AUDITLOG.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLogLogger.error(`${config.ERROR.AUDITLOG.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
