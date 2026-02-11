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
import {
	CreateMetricsSchema,
	UpdateMetricsSchema,
	CollectMetricsSchema,
} from "../../zod/metrics.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const metricsLogger = logger.child({ module: "metrics" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			metricsLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			metricsLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateMetricsSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			metricsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const metrics = await prisma.metrics.create({ data: validation.data });
			metricsLogger.info(`Metrics created successfully: ${metrics.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.METRICS.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.METRICS.DESCRIPTIONS.CREATED}: ${metrics.name || metrics.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.METRICS.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.METRICS,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.METRICS,
				entityId: metrics.id,
				changesBefore: null,
				changesAfter: {
					id: metrics.id,
					name: metrics.name,
					description: metrics.description,
					createdAt: metrics.createdAt,
					updatedAt: metrics.updatedAt,
				},
				description: `${config.AUDIT_LOG.METRICS.DESCRIPTIONS.CREATED}: ${metrics.name || metrics.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:metrics:list:*");
				metricsLogger.info("Metrics list cache invalidated after creation");
			} catch (cacheError) {
				metricsLogger.warn(
					"Failed to invalidate cache after metrics creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.METRICS.CREATED,
				metrics,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			metricsLogger.error(`${config.ERROR.METRICS.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, metricsLogger);

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

		metricsLogger.info(
			`Getting metricss, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.MetricsWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Metrics", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Metrics", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [metricss, total] = await Promise.all([
				document ? prisma.metrics.findMany(findManyQuery) : [],
				count ? prisma.metrics.count({ where: whereClause }) : 0,
			]);

			metricsLogger.info(`Retrieved ${metricss.length} metricss`);
			const processedData =
				groupBy && document ? groupDataByField(metricss, groupBy as string) : metricss;

			const responseData: Record<string, any> = {
				...(document && { metricss: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.METRICS.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			metricsLogger.error(`${config.ERROR.METRICS.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				metricsLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				metricsLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			metricsLogger.info(`${config.SUCCESS.METRICS.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:metrics:byId:${id}:${fields || "full"}`;
			let metrics = null;

			try {
				if (redisClient.isClientConnected()) {
					metrics = await redisClient.getJSON(cacheKey);
					if (metrics) {
						metricsLogger.info(`Metrics ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				metricsLogger.warn(`Redis cache retrieval failed for metrics ${id}:`, cacheError);
			}

			if (!metrics) {
				const query: Prisma.MetricsFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				metrics = await prisma.metrics.findFirst(query);

				if (metrics && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, metrics, 3600);
						metricsLogger.info(`Metrics ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						metricsLogger.warn(
							`Failed to store metrics ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!metrics) {
				metricsLogger.error(`${config.ERROR.METRICS.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.METRICS.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			metricsLogger.info(`${config.SUCCESS.METRICS.RETRIEVED}: ${(metrics as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.METRICS.RETRIEVED,
				metrics,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			metricsLogger.error(`${config.ERROR.METRICS.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				metricsLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateMetricsSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				metricsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				metricsLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			metricsLogger.info(`Updating metrics: ${id}`);

			const existingMetrics = await prisma.metrics.findFirst({
				where: { id },
			});

			if (!existingMetrics) {
				metricsLogger.error(`${config.ERROR.METRICS.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.METRICS.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedMetrics = await prisma.metrics.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:metrics:byId:${id}:*`);
				await invalidateCache.byPattern("cache:metrics:list:*");
				metricsLogger.info(`Cache invalidated after metrics ${id} update`);
			} catch (cacheError) {
				metricsLogger.warn("Failed to invalidate cache after metrics update:", cacheError);
			}

			metricsLogger.info(`${config.SUCCESS.METRICS.UPDATED}: ${updatedMetrics.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.METRICS.UPDATED,
				{ metrics: updatedMetrics },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			metricsLogger.error(`${config.ERROR.METRICS.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				metricsLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			metricsLogger.info(`${config.SUCCESS.METRICS.DELETED}: ${id}`);

			const existingMetrics = await prisma.metrics.findFirst({
				where: { id },
			});

			if (!existingMetrics) {
				metricsLogger.error(`${config.ERROR.METRICS.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.METRICS.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.metrics.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:metrics:byId:${id}:*`);
				await invalidateCache.byPattern("cache:metrics:list:*");
				metricsLogger.info(`Cache invalidated after metrics ${id} deletion`);
			} catch (cacheError) {
				metricsLogger.warn(
					"Failed to invalidate cache after metrics deletion:",
					cacheError,
				);
			}

			metricsLogger.info(`${config.SUCCESS.METRICS.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.METRICS.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			metricsLogger.error(`${config.ERROR.METRICS.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const collect = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const validation = CollectMetricsSchema.safeParse(req.body);

			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error);
				metricsLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const { model: modelName, data: dataTypes, filter = {} } = validation.data;
			metricsLogger.info(`Collecting metrics for model: ${modelName}`);

			try {
				const result = await processModelMetrics(modelName, dataTypes, filter);

				logActivity(req, {
					userId: (req as any).user?.id || "unknown",
					action: "COLLECT_METRICS",
					description: `Collected metrics for model: ${modelName}`,
					page: {
						url: req.originalUrl,
						title: "Metrics Collection",
					},
				});

				const successResponse = buildSuccessResponse(
					"Metrics collected successfully",
					result,
					200,
				);
				res.status(200).json(successResponse);
			} catch (modelError) {
				metricsLogger.error(`Error processing metrics for ${modelName}: ${modelError}`);
				const errorResponse = buildErrorResponse(
					`Failed to collect metrics: ${modelError instanceof Error ? modelError.message : "Unknown error"}`,
					400,
				);
				res.status(400).json(errorResponse);
			}
		} catch (error) {
			metricsLogger.error(`Error collecting metrics: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	// Helper function to process individual model metrics
	const processModelMetrics = async (
		modelName: string,
		dataTypes: string[],
		filter: Record<string, any> = {},
	): Promise<any> => {
		// Get the Prisma model dynamically
		const model = (prisma as any)[modelName.toLowerCase()];
		if (!model) {
			throw new Error(`Model "${modelName}" not found`);
		}

		// Extract date filters from the filter object
		const { dateFrom, dateTo, ...otherFilters } = filter;

		// Build where clause with filters
		const whereClause: any = {
			...otherFilters,
			isDeleted: false,
		};

		// Add date range filter if provided
		if (dateFrom || dateTo) {
			const dateField = "createdAt"; // Default date field
			whereClause[dateField] = {};
			if (dateFrom) {
				whereClause[dateField].gte = new Date(dateFrom);
			}
			if (dateTo) {
				whereClause[dateField].lte = new Date(dateTo);
			}
		}

		const result: any = {};

		// Process each requested data type
		for (const dataType of dataTypes) {
			try {
				// Handle time-based metrics (today, thisWeek, thisMonth, thisQuarter, thisYear, weekly, monthly, annual)
				const timePeriodKeywords = [
					"today",
					"thisweek",
					"thismonth",
					"thisquarter",
					"thisyear",
					"weekly",
					"monthly",
					"annual",
				];
				const isTimeBased = timePeriodKeywords.some((keyword) =>
					dataType.toLowerCase().includes(keyword),
				);

				if (isTimeBased) {
					const records = await model.findMany({
						where: whereClause,
						select: { createdAt: true },
					});

					const now = new Date();
					let startDate = new Date();
					let endDate = new Date(now);

					// Determine the time range based on the data type
					const lowerDataType = dataType.toLowerCase();

					if (lowerDataType.includes("today")) {
						// Today: Start of today to now
						startDate.setHours(0, 0, 0, 0);
					} else if (lowerDataType.includes("thisweek")) {
						// This Week: Start of this week (Monday) to now
						const day = now.getDay();
						const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
						startDate = new Date(now.setDate(diff));
						startDate.setHours(0, 0, 0, 0);
					} else if (lowerDataType.includes("thismonth")) {
						// This Month: Start of this month to now
						startDate = new Date(now.getFullYear(), now.getMonth(), 1);
						startDate.setHours(0, 0, 0, 0);
					} else if (lowerDataType.includes("thisquarter")) {
						// This Quarter: Start of current quarter to now
						const currentMonth = now.getMonth();
						const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
						startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
						startDate.setHours(0, 0, 0, 0);
					} else if (lowerDataType.includes("thisyear")) {
						// This Year: Start of this year to now
						startDate = new Date(now.getFullYear(), 0, 1);
						startDate.setHours(0, 0, 0, 0);
					} else if (lowerDataType.includes("weekly")) {
						// Last 7 days
						startDate.setDate(startDate.getDate() - 7);
					} else if (lowerDataType.includes("monthly")) {
						// Last 30 days
						startDate.setDate(startDate.getDate() - 30);
					} else if (lowerDataType.includes("annual")) {
						// Last 365 days
						startDate.setDate(startDate.getDate() - 365);
					}

					const count = records.filter((r: any) => {
						const createdAt = new Date(r.createdAt);
						return createdAt >= startDate && createdAt <= endDate;
					}).length;

					result[dataType] = count;
				}
				// Standard metric types
				else {
					switch (dataType) {
						case "count":
							result.count = await model.count({ where: whereClause });
							break;

						case "sum":
							// For sum, aggregate common numeric fields
							const sumFields = ["amount", "quantity", "total", "price"];
							result.sum = {};
							for (const field of sumFields) {
								try {
									const aggregation = await model.aggregate({
										where: whereClause,
										_sum: { [field]: true },
									});
									if (aggregation._sum[field] !== null) {
										result.sum[field] = aggregation._sum[field];
									}
								} catch {
									// Field doesn't exist, skip it
								}
							}
							break;

						case "average":
							// Aggregate average for numeric fields
							const avgFields = ["amount", "quantity", "price"];
							result.average = {};
							for (const field of avgFields) {
								try {
									const aggregation = await model.aggregate({
										where: whereClause,
										_avg: { [field]: true },
									});
									if (aggregation._avg[field] !== null) {
										result.average[field] = aggregation._avg[field];
									}
								} catch {
									// Field doesn't exist, skip it
								}
							}
							break;

						case "min":
							const minFields = ["amount", "quantity", "price", "createdAt"];
							result.min = {};
							for (const field of minFields) {
								try {
									const aggregation = await model.aggregate({
										where: whereClause,
										_min: { [field]: true },
									});
									if (aggregation._min[field] !== null) {
										result.min[field] = aggregation._min[field];
									}
								} catch {
									// Field doesn't exist, skip it
								}
							}
							break;

						case "max":
							const maxFields = ["amount", "quantity", "price", "createdAt"];
							result.max = {};
							for (const field of maxFields) {
								try {
									const aggregation = await model.aggregate({
										where: whereClause,
										_max: { [field]: true },
									});
									if (aggregation._max[field] !== null) {
										result.max[field] = aggregation._max[field];
									}
								} catch {
									// Field doesn't exist, skip it
								}
							}
							break;

						case "byStatus":
							// Group by status field
							const statusField = "status";
							const records = await model.findMany({
								where: whereClause,
								select: { [statusField]: true },
							});
							result.byStatus = records.reduce((acc: any, record: any) => {
								const status = record[statusField] || "unknown";
								acc[status] = (acc[status] || 0) + 1;
								return acc;
							}, {});
							break;

						case "stockStatus":
							// For products, calculate stock levels
							if (modelName.toLowerCase() === "product") {
								const products = await model.findMany({
									where: whereClause,
									select: { quantity: true, reorderLevel: true },
								});

								result.stockStatus = {
									inStock: products.filter(
										(p: any) =>
											p.quantity > (p.reorderLevel || 0) && p.quantity > 0,
									).length,
									lowStock: products.filter(
										(p: any) =>
											p.quantity <= (p.reorderLevel || 10) && p.quantity > 0,
									).length,
									outOfStock: products.filter((p: any) => p.quantity === 0)
										.length,
								};
							}
							break;

						case "resolved":
							// For alerts or issues, count resolved vs unresolved
							if (modelName.toLowerCase() === "alert") {
								const resolvedField = "isResolved";
								const resolved = await model.count({
									where: { ...whereClause, [resolvedField]: true },
								});
								const unresolved = await model.count({
									where: { ...whereClause, [resolvedField]: false },
								});
								result.resolved = { resolved, unresolved };
							}
							break;

						default:
							// Try to use it as a field name for grouping
							try {
								const records = await model.findMany({
									where: whereClause,
									select: { [dataType]: true },
								});
								result[dataType] = records.reduce((acc: any, record: any) => {
									const key = record[dataType] || "unknown";
									acc[key] = (acc[key] || 0) + 1;
									return acc;
								}, {});
							} catch {
								metricsLogger.warn(`Unknown data type or field: ${dataType}`);
							}
					}
				}
			} catch (typeError) {
				metricsLogger.error(
					`Error processing data type "${dataType}" for model "${modelName}": ${typeError}`,
				);
				result[dataType] = {
					error: `Failed to process: ${typeError instanceof Error ? typeError.message : "Unknown error"}`,
				};
			}
		}

		return result;
	};

	return { create, getAll, getById, update, remove, collect };
};
