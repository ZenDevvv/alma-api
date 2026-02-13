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
import { CreateCourseSchema, UpdateCourseSchema, AddPrerequisiteSchema } from "../../zod/course.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const courseLogger = logger.child({ module: "course" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			courseLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			courseLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateCourseSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			courseLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const course = await prisma.course.create({ data: validation.data });
			courseLogger.info(`Course created successfully: ${course.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.COURSE.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.COURSE.DESCRIPTIONS.CREATED}: ${course.title || course.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.COURSE.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.COURSE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.COURSE,
				entityId: course.id,
				changesBefore: null,
				changesAfter: {
					id: course.id,
					title: course.title,
					code: course.code,
					status: course.status,
					level: course.level,
					orgId: course.orgId,
					createdAt: course.createdAt,
					updatedAt: course.updatedAt,
				},
				description: `${config.AUDIT_LOG.COURSE.DESCRIPTIONS.CREATED}: ${course.title || course.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:course:list:*");
				courseLogger.info("Course list cache invalidated after creation");
			} catch (cacheError) {
				courseLogger.warn(
					"Failed to invalidate cache after course creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.COURSE.CREATED,
				course,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			courseLogger.error(`${config.ERROR.COURSE.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, courseLogger);

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

		courseLogger.info(
			`Getting courses, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.CourseWhereInput = {
				isDeleted: false,
			};

			// Search fields for Course
			const searchFields = ["title", "code", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Course", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Course", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [courses, total] = await Promise.all([
				document ? prisma.course.findMany(findManyQuery) : [],
				count ? prisma.course.count({ where: whereClause }) : 0,
			]);

			courseLogger.info(`Retrieved ${courses.length} courses`);
			const processedData =
				groupBy && document ? groupDataByField(courses, groupBy as string) : courses;

			const responseData: Record<string, any> = {
				...(document && { courses: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.COURSE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			courseLogger.error(`${config.ERROR.COURSE.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				courseLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				courseLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			courseLogger.info(`${config.SUCCESS.COURSE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:course:byId:${id}:${fields || "full"}`;
			let course = null;

			try {
				if (redisClient.isClientConnected()) {
					course = await redisClient.getJSON(cacheKey);
					if (course) {
						courseLogger.info(`Course ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				courseLogger.warn(`Redis cache retrieval failed for course ${id}:`, cacheError);
			}

			if (!course) {
				const query: Prisma.CourseFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				course = await prisma.course.findFirst(query);

				if (course && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, course, 3600);
						courseLogger.info(`Course ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						courseLogger.warn(
							`Failed to store course ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!course) {
				courseLogger.error(`${config.ERROR.COURSE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.COURSE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			courseLogger.info(`${config.SUCCESS.COURSE.RETRIEVED}: ${(course as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.COURSE.RETRIEVED,
				course,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			courseLogger.error(`${config.ERROR.COURSE.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				courseLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateCourseSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				courseLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				courseLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			courseLogger.info(`Updating course: ${id}`);

			const existingCourse = await prisma.course.findFirst({
				where: { id },
			});

			if (!existingCourse) {
				courseLogger.error(`${config.ERROR.COURSE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.COURSE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedCourse = await prisma.course.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:course:byId:${id}:*`);
				await invalidateCache.byPattern("cache:course:list:*");
				courseLogger.info(`Cache invalidated after course ${id} update`);
			} catch (cacheError) {
				courseLogger.warn(
					"Failed to invalidate cache after course update:",
					cacheError,
				);
			}

			courseLogger.info(`${config.SUCCESS.COURSE.UPDATED}: ${updatedCourse.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.COURSE.UPDATED,
				{ course: updatedCourse },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			courseLogger.error(`${config.ERROR.COURSE.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				courseLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			courseLogger.info(`${config.SUCCESS.COURSE.DELETED}: ${id}`);

			const existingCourse = await prisma.course.findFirst({
				where: { id },
			});

			if (!existingCourse) {
				courseLogger.error(`${config.ERROR.COURSE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.COURSE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.course.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:course:byId:${id}:*`);
				await invalidateCache.byPattern("cache:course:list:*");
				courseLogger.info(`Cache invalidated after course ${id} deletion`);
			} catch (cacheError) {
				courseLogger.warn(
					"Failed to invalidate cache after course deletion:",
					cacheError,
				);
			}

			courseLogger.info(`${config.SUCCESS.COURSE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.COURSE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			courseLogger.error(`${config.ERROR.COURSE.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const addPrerequisite = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validation = AddPrerequisiteSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error);
				courseLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const { prerequisiteId } = validation.data;

			if (id === prerequisiteId) {
				const errorResponse = buildErrorResponse("A course cannot be a prerequisite of itself", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Verify both courses exist
			const [course, prerequisite] = await Promise.all([
				prisma.course.findFirst({ where: { id, isDeleted: false } }),
				prisma.course.findFirst({ where: { id: prerequisiteId, isDeleted: false } }),
			]);

			if (!course) {
				const errorResponse = buildErrorResponse(config.ERROR.COURSE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (!prerequisite) {
				const errorResponse = buildErrorResponse("Prerequisite course not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const record = await prisma.coursePrerequisite.create({
				data: { courseId: id, prerequisiteId },
				include: { prerequisite: true },
			});

			courseLogger.info(`Prerequisite ${prerequisiteId} added to course ${id}`);

			try {
				await invalidateCache.byPattern(`cache:course:byId:${id}:*`);
				courseLogger.info(`Cache invalidated after adding prerequisite to course ${id}`);
			} catch (cacheError) {
				courseLogger.warn("Failed to invalidate cache after adding prerequisite:", cacheError);
			}

			const successResponse = buildSuccessResponse("Prerequisite added successfully", record, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			courseLogger.error(`Error adding prerequisite to course ${id}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const removePrerequisite = async (req: Request, res: Response, _next: NextFunction) => {
		const { id, prerequisiteId } = req.params;

		try {
			if (!id || !prerequisiteId) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			await prisma.coursePrerequisite.delete({
				where: {
					courseId_prerequisiteId: { courseId: id, prerequisiteId },
				},
			});

			courseLogger.info(`Prerequisite ${prerequisiteId} removed from course ${id}`);

			try {
				await invalidateCache.byPattern(`cache:course:byId:${id}:*`);
				courseLogger.info(`Cache invalidated after removing prerequisite from course ${id}`);
			} catch (cacheError) {
				courseLogger.warn("Failed to invalidate cache after removing prerequisite:", cacheError);
			}

			const successResponse = buildSuccessResponse("Prerequisite removed successfully", {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			courseLogger.error(`Error removing prerequisite from course ${id}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getPrerequisites = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const course = await prisma.course.findFirst({
				where: { id, isDeleted: false },
			});

			if (!course) {
				const errorResponse = buildErrorResponse(config.ERROR.COURSE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prerequisites = await prisma.coursePrerequisite.findMany({
				where: { courseId: id },
				include: { prerequisite: true },
			});

			courseLogger.info(`Retrieved ${prerequisites.length} prerequisites for course ${id}`);

			const successResponse = buildSuccessResponse(
				"Prerequisites retrieved successfully",
				{ prerequisites },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			courseLogger.error(`Error getting prerequisites for course ${id}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, addPrerequisite, removePrerequisite, getPrerequisites };
};
