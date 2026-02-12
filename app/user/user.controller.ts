import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import * as argon2 from "argon2";
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
import { CreateUserSchema, UpdateUserSchema } from "../../zod/user.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";

const logger = getLogger();
const userLogger = logger.child({ module: "user" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			userLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			userLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateUserSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			userLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Transform null values to undefined for Prisma compatibility
			const prismaData: Prisma.UserUncheckedCreateInput = {
				...validation.data,
			};

			if (prismaData.password) {
				prismaData.password = await argon2.hash(prismaData.password);
			}

			const user = await prisma.user.create({ data: prismaData });
			userLogger.info(`User created successfully: ${user.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.USER.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.USER.DESCRIPTIONS.CREATED}: ${user.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.USER.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.USER,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: user.id,
				changesBefore: null,
				changesAfter: {
					id: user.id,

					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				},
				description: `${config.AUDIT_LOG.USER.DESCRIPTIONS.CREATED}: ${user.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:user:list:*");
				userLogger.info("User list cache invalidated after creation");
			} catch (cacheError) {
				userLogger.warn("Failed to invalidate cache after user creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.USER.CREATED, user, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			userLogger.error(`${config.ERROR.USER.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, userLogger);

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

		userLogger.info(
			`Getting users, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.UserWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["userName"];
			if (query) {
				const searchConditions = buildSearchConditions("User", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("User", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [users, total] = await Promise.all([
				document ? prisma.user.findMany(findManyQuery) : [],
				count ? prisma.user.count({ where: whereClause }) : 0,
			]);

			userLogger.info(`Retrieved ${users.length} users`);
			const processedData =
				groupBy && document ? groupDataByField(users, groupBy as string) : users;

			const responseData: Record<string, any> = {
				...(document && { users: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.USER.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			userLogger.error(`${config.ERROR.USER.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				userLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				userLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			userLogger.info(`${config.SUCCESS.USER.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:user:byId:${id}:${fields || "full"}`;
			let user = null;

			try {
				if (redisClient.isClientConnected()) {
					user = await redisClient.getJSON(cacheKey);
					if (user) {
						userLogger.info(`User ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				userLogger.warn(`Redis cache retrieval failed for user ${id}:`, cacheError);
			}

			if (!user) {
				const query: Prisma.UserFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				user = await prisma.user.findFirst(query);

				if (user && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, user, 3600);
						userLogger.info(`User ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						userLogger.warn(`Failed to store user ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!user) {
				userLogger.error(`${config.ERROR.USER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.USER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			userLogger.info(`${config.SUCCESS.USER.RETRIEVED}: ${(user as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.USER.RETRIEVED, user, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			userLogger.error(`${config.ERROR.USER.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				userLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateUserSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				userLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				userLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			userLogger.info(`Updating user: ${id}`);

			const existingUser = await prisma.user.findFirst({
				where: { id },
			});

			if (!existingUser) {
				userLogger.error(`${config.ERROR.USER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.USER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedUser = await prisma.user.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:user:byId:${id}:*`);
				await invalidateCache.byPattern("cache:user:list:*");
				userLogger.info(`Cache invalidated after user ${id} update`);
			} catch (cacheError) {
				userLogger.warn("Failed to invalidate cache after user update:", cacheError);
			}

			userLogger.info(`${config.SUCCESS.USER.UPDATED}: ${updatedUser.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.USER.UPDATED,
				{ user: updatedUser },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			userLogger.error(`${config.ERROR.USER.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				userLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			userLogger.info(`${config.SUCCESS.USER.DELETED}: ${id}`);

			const existingUser = await prisma.user.findFirst({
				where: { id },
			});

			if (!existingUser) {
				userLogger.error(`${config.ERROR.USER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.USER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.user.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:user:byId:${id}:*`);
				await invalidateCache.byPattern("cache:user:list:*");
				userLogger.info(`Cache invalidated after user ${id} deletion`);
			} catch (cacheError) {
				userLogger.warn("Failed to invalidate cache after user deletion:", cacheError);
			}

			userLogger.info(`${config.SUCCESS.USER.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.USER.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			userLogger.error(`${config.ERROR.USER.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getCurrentUser = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const userId = req.userId;

		if (!userId) {
			userLogger.error(config.ERROR.USER.UNAUTHORIZED_USER_ID_NOT_FOUND);
			res.status(401).json({
				message: config.ERROR.USER.UNAUTHORIZED_USER_ID_NOT_FOUND,
				status: 401,
			});
			return;
		}

		userLogger.info(`Getting current user: ${userId}`);

		try {
			const user = await prisma.user.findUnique({
				where: {
					id: userId,
					isDeleted: false,
				},
				include: {
					person: true,
				},
			});

			if (!user) {
				userLogger.error(`${config.ERROR.USER.NOT_FOUND}: ${userId}`);
				res.status(404).json({ message: config.ERROR.USER.NOT_FOUND, status: 404 });
				return;
			}
			const { password, ...userWithoutPassword } = user;

			logActivity(req, {
				userId: userId,
				action: "GET_CURRENT_USER",
				description: `Retrieved current user profile`,

				page: { url: req.originalUrl, title: "Current User Profile" },
			});

			userLogger.info(`${config.SUCCESS.USER.RETRIEVED}: ${user.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.USER.GETTING_BY_ID,
				{ user: userWithoutPassword },
				200,
			);
			res.status(200).json(successResponse);
			return;
		} catch (error: any) {
			userLogger.error(`${config.ERROR.USER.ERROR_GETTING_USER}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
			return;
		}
	};

	return { create, getAll, getById, update, remove, getCurrentUser };
};
