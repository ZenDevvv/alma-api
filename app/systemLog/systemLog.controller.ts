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
import { CreateSystemLogSchema, UpdateSystemLogSchema } from "../../zod/systemLog.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const systemLogLogger = logger.child({ module: "systemLog" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			systemLogLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			systemLogLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateSystemLogSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			systemLogLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const systemLog = await prisma.systemLog.create({ data: validation.data });
			systemLogLogger.info(`SystemLog created successfully: ${systemLog.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SYSTEMLOG.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.SYSTEMLOG.DESCRIPTIONS.CREATED}: ${systemLog.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SYSTEMLOG.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SYSTEMLOG,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SYSTEMLOG,
				entityId: systemLog.id,
				changesBefore: null,
				changesAfter: {
					...systemLog,
				},
				description: `${config.AUDIT_LOG.SYSTEMLOG.DESCRIPTIONS.CREATED}: ${systemLog.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:systemLog:list:*");
				systemLogLogger.info("SystemLog list cache invalidated after creation");
			} catch (cacheError) {
				systemLogLogger.warn(
					"Failed to invalidate cache after systemLog creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SYSTEMLOG.CREATED,
				systemLog,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			systemLogLogger.error(`${config.ERROR.SYSTEMLOG.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, systemLogLogger);

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

		systemLogLogger.info(
			`Getting systemLogs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.SystemLogWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["id", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("SystemLog", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("SystemLog", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [systemLogs, total] = await Promise.all([
				document ? prisma.systemLog.findMany(findManyQuery) : [],
				count ? prisma.systemLog.count({ where: whereClause }) : 0,
			]);

			systemLogLogger.info(`Retrieved ${systemLogs.length} systemLogs`);
			const processedData =
				groupBy && document ? groupDataByField(systemLogs, groupBy as string) : systemLogs;

			const responseData: Record<string, any> = {
				...(document && { systemLogs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SYSTEMLOG.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			systemLogLogger.error(`${config.ERROR.SYSTEMLOG.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				systemLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				systemLogLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			systemLogLogger.info(`${config.SUCCESS.SYSTEMLOG.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:systemLog:byId:${id}:${fields || "full"}`;
			let systemLog = null;

			try {
				if (redisClient.isClientConnected()) {
					systemLog = await redisClient.getJSON(cacheKey);
					if (systemLog) {
						systemLogLogger.info(`SystemLog ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				systemLogLogger.warn(
					`Redis cache retrieval failed for systemLog ${id}:`,
					cacheError,
				);
			}

			if (!systemLog) {
				const query: Prisma.SystemLogFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				systemLog = await prisma.systemLog.findFirst(query);

				if (systemLog && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, systemLog, 3600);
						systemLogLogger.info(`SystemLog ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						systemLogLogger.warn(
							`Failed to store systemLog ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!systemLog) {
				systemLogLogger.error(`${config.ERROR.SYSTEMLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SYSTEMLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			systemLogLogger.info(`${config.SUCCESS.SYSTEMLOG.RETRIEVED}: ${(systemLog as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SYSTEMLOG.RETRIEVED,
				systemLog,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			systemLogLogger.error(`${config.ERROR.SYSTEMLOG.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				systemLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSystemLogSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				systemLogLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				systemLogLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			systemLogLogger.info(`Updating systemLog: ${id}`);

			const existingSystemLog = await prisma.systemLog.findFirst({
				where: { id },
			});

			if (!existingSystemLog) {
				systemLogLogger.error(`${config.ERROR.SYSTEMLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SYSTEMLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedSystemLog = await prisma.systemLog.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:systemLog:byId:${id}:*`);
				await invalidateCache.byPattern("cache:systemLog:list:*");
				systemLogLogger.info(`Cache invalidated after systemLog ${id} update`);
			} catch (cacheError) {
				systemLogLogger.warn(
					"Failed to invalidate cache after systemLog update:",
					cacheError,
				);
			}

			systemLogLogger.info(`${config.SUCCESS.SYSTEMLOG.UPDATED}: ${updatedSystemLog.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SYSTEMLOG.UPDATED,
				{ systemLog: updatedSystemLog },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			systemLogLogger.error(`${config.ERROR.SYSTEMLOG.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				systemLogLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			systemLogLogger.info(`${config.SUCCESS.SYSTEMLOG.DELETED}: ${id}`);

			const existingSystemLog = await prisma.systemLog.findFirst({
				where: { id },
			});

			if (!existingSystemLog) {
				systemLogLogger.error(`${config.ERROR.SYSTEMLOG.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SYSTEMLOG.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.systemLog.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:systemLog:byId:${id}:*`);
				await invalidateCache.byPattern("cache:systemLog:list:*");
				systemLogLogger.info(`Cache invalidated after systemLog ${id} deletion`);
			} catch (cacheError) {
				systemLogLogger.warn(
					"Failed to invalidate cache after systemLog deletion:",
					cacheError,
				);
			}

			systemLogLogger.info(`${config.SUCCESS.SYSTEMLOG.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SYSTEMLOG.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			systemLogLogger.error(`${config.ERROR.SYSTEMLOG.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
