import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { generateNextNumber } from "../../helper/generateDeliverCode";
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
import { CreateBatchSchema, UpdateBatchSchema } from "../../zod/batch.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";

const logger = getLogger();
const batchLogger = logger.child({ module: "batch" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			batchLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			batchLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateBatchSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			batchLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const batch = await prisma.batch.create({
				data: {
					...validation.data,
				},
			});
			batchLogger.info(`Batch created successfully: ${batch.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.BATCH.ACTIONS.CREATE_BATCH,
				description: `${config.ACTIVITY_LOG.BATCH.DESCRIPTIONS.BATCH_CREATED}: ${batch.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.BATCH.PAGES.BATCH_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.BATCH,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.BATCH,
				entityId: batch.id,
				changesBefore: null,
				changesAfter: {
					id: batch.id,
					createdAt: batch.createdAt,
					updatedAt: batch.updatedAt,
				},
				description: `${config.AUDIT_LOG.BATCH.DESCRIPTIONS.BATCH_CREATED}: ${batch.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:batch:list:*");
				batchLogger.info("Batch list cache invalidated after creation");
			} catch (cacheError) {
				batchLogger.warn("Failed to invalidate cache after batch creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.BATCH.CREATED, batch, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			batchLogger.error(`${config.ERROR.BATCH.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, batchLogger);

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

		batchLogger.info(
			`Getting batchs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.BatchWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Batch", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Batch", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [batchs, total] = await Promise.all([
				document ? prisma.batch.findMany(findManyQuery) : [],
				count ? prisma.batch.count({ where: whereClause }) : 0,
			]);

			batchLogger.info(`Retrieved ${batchs.length} batchs`);
			const processedData =
				groupBy && document ? groupDataByField(batchs, groupBy as string) : batchs;

			const responseData: Record<string, any> = {
				...(document && { batchs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.BATCH.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			batchLogger.error(`${config.ERROR.BATCH.GET_ALL_FAILED}: ${error}`);
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
				batchLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				batchLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			batchLogger.info(`${config.SUCCESS.BATCH.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:batch:byId:${id}:${fields || "full"}`;
			let batch = null;

			try {
				if (redisClient.isClientConnected()) {
					batch = await redisClient.getJSON(cacheKey);
					if (batch) {
						batchLogger.info(`Batch ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				batchLogger.warn(`Redis cache retrieval failed for batch ${id}:`, cacheError);
			}

			if (!batch) {
				const query: Prisma.BatchFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				batch = await prisma.batch.findFirst(query);

				if (batch && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, batch, 3600);
						batchLogger.info(`Batch ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						batchLogger.warn(`Failed to store batch ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!batch) {
				batchLogger.error(`${config.ERROR.BATCH.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.BATCH.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			batchLogger.info(`${config.SUCCESS.BATCH.RETRIEVED}: ${(batch as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BATCH.RETRIEVED,
				batch,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			batchLogger.error(`${config.ERROR.BATCH.ERROR_GETTING}: ${error}`);
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
				batchLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateBatchSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				batchLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				batchLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			batchLogger.info(`Updating batch: ${id}`);

			const existingBatch = await prisma.batch.findFirst({
				where: { id },
			});

			if (!existingBatch) {
				batchLogger.error(`${config.ERROR.BATCH.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.BATCH.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedBatch = await prisma.batch.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:batch:byId:${id}:*`);
				await invalidateCache.byPattern("cache:batch:list:*");
				batchLogger.info(`Cache invalidated after batch ${id} update`);
			} catch (cacheError) {
				batchLogger.warn("Failed to invalidate cache after batch update:", cacheError);
			}

			batchLogger.info(`${config.SUCCESS.BATCH.UPDATED}: ${updatedBatch.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BATCH.UPDATED,
				{ batch: updatedBatch },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			batchLogger.error(`${config.ERROR.BATCH.ERROR_UPDATING}: ${error}`);
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
				batchLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			batchLogger.info(`${config.SUCCESS.BATCH.DELETED}: ${id}`);

			const existingBatch = await prisma.batch.findFirst({
				where: { id },
			});

			if (!existingBatch) {
				batchLogger.error(`${config.ERROR.BATCH.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.BATCH.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.batch.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:batch:byId:${id}:*`);
				await invalidateCache.byPattern("cache:batch:list:*");
				batchLogger.info(`Cache invalidated after batch ${id} deletion`);
			} catch (cacheError) {
				batchLogger.warn("Failed to invalidate cache after batch deletion:", cacheError);
			}

			batchLogger.info(`${config.SUCCESS.BATCH.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.BATCH.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			batchLogger.error(`${config.ERROR.BATCH.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
