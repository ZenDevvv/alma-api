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
import { CreateFacultySchema, UpdateFacultySchema } from "../../zod/faculty.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const facultyLogger = logger.child({ module: "faculty" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			facultyLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			facultyLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateFacultySchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			facultyLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const faculty = await prisma.faculty.create({ data: validation.data });
			facultyLogger.info(`Faculty created successfully: ${faculty.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.FACULTY.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.FACULTY.DESCRIPTIONS.CREATED}: ${faculty.name || faculty.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.FACULTY.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.FACULTY,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.FACULTY,
				entityId: faculty.id,
				changesBefore: null,
				changesAfter: {
					id: faculty.id,
					name: faculty.name,
					code: faculty.code,
					status: faculty.status,
					orgId: faculty.orgId,
					createdAt: faculty.createdAt,
					updatedAt: faculty.updatedAt,
				},
				description: `${config.AUDIT_LOG.FACULTY.DESCRIPTIONS.CREATED}: ${faculty.name || faculty.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:faculty:list:*");
				facultyLogger.info("Faculty list cache invalidated after creation");
			} catch (cacheError) {
				facultyLogger.warn("Failed to invalidate cache after faculty creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.FACULTY.CREATED, faculty, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			facultyLogger.error(`${config.ERROR.FACULTY.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, facultyLogger);

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

		facultyLogger.info(
			`Getting faculties, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.FacultyWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["name", "code", "description", "status"];
			if (query) {
				const searchConditions = buildSearchConditions("Faculty", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Faculty", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [faculties, total] = await Promise.all([
				document ? prisma.faculty.findMany(findManyQuery) : [],
				count ? prisma.faculty.count({ where: whereClause }) : 0,
			]);

			facultyLogger.info(`Retrieved ${faculties.length} faculties`);
			const processedData =
				groupBy && document ? groupDataByField(faculties, groupBy as string) : faculties;

			const responseData: Record<string, any> = {
				...(document && { faculties: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.FACULTY.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			facultyLogger.error(`${config.ERROR.FACULTY.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				facultyLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				facultyLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			facultyLogger.info(`${config.SUCCESS.FACULTY.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:faculty:byId:${id}:${fields || "full"}`;
			let faculty = null;

			try {
				if (redisClient.isClientConnected()) {
					faculty = await redisClient.getJSON(cacheKey);
					if (faculty) {
						facultyLogger.info(`Faculty ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				facultyLogger.warn(`Redis cache retrieval failed for faculty ${id}:`, cacheError);
			}

			if (!faculty) {
				const query: Prisma.FacultyFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				faculty = await prisma.faculty.findFirst(query);

				if (faculty && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, faculty, 3600);
						facultyLogger.info(`Faculty ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						facultyLogger.warn(`Failed to store faculty ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!faculty) {
				facultyLogger.error(`${config.ERROR.FACULTY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.FACULTY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			facultyLogger.info(`${config.SUCCESS.FACULTY.RETRIEVED}: ${(faculty as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.FACULTY.RETRIEVED, faculty, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			facultyLogger.error(`${config.ERROR.FACULTY.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				facultyLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateFacultySchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				facultyLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				facultyLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			facultyLogger.info(`Updating faculty: ${id}`);

			const existingFaculty = await prisma.faculty.findFirst({
				where: { id },
			});

			if (!existingFaculty) {
				facultyLogger.error(`${config.ERROR.FACULTY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.FACULTY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedFaculty = await prisma.faculty.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:faculty:byId:${id}:*`);
				await invalidateCache.byPattern("cache:faculty:list:*");
				facultyLogger.info(`Cache invalidated after faculty ${id} update`);
			} catch (cacheError) {
				facultyLogger.warn("Failed to invalidate cache after faculty update:", cacheError);
			}

			facultyLogger.info(`${config.SUCCESS.FACULTY.UPDATED}: ${updatedFaculty.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.FACULTY.UPDATED,
				{ faculty: updatedFaculty },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			facultyLogger.error(`${config.ERROR.FACULTY.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				facultyLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			facultyLogger.info(`${config.SUCCESS.FACULTY.DELETED}: ${id}`);

			const existingFaculty = await prisma.faculty.findFirst({
				where: { id },
			});

			if (!existingFaculty) {
				facultyLogger.error(`${config.ERROR.FACULTY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.FACULTY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.faculty.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:faculty:byId:${id}:*`);
				await invalidateCache.byPattern("cache:faculty:list:*");
				facultyLogger.info(`Cache invalidated after faculty ${id} deletion`);
			} catch (cacheError) {
				facultyLogger.warn("Failed to invalidate cache after faculty deletion:", cacheError);
			}

			facultyLogger.info(`${config.SUCCESS.FACULTY.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.FACULTY.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			facultyLogger.error(`${config.ERROR.FACULTY.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
