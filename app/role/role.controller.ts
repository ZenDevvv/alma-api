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
import { CreateRoleSchema, UpdateRoleSchema } from "../../zod/role.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const roleLogger = logger.child({ module: "role" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			roleLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			roleLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateRoleSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			roleLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const role = await prisma.userRole.create({ data: validation.data });
			roleLogger.info(`Role created successfully: ${role.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ROLE.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.ROLE.DESCRIPTIONS.CREATED}: ${role.name || role.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ROLE.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ROLE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ROLE,
				entityId: role.id,
				changesBefore: null,
				changesAfter: {
					id: role.id,
					name: role.name,
					description: role.description,
					createdAt: role.createdAt,
					updatedAt: role.updatedAt,
				},
				description: `${config.AUDIT_LOG.ROLE.DESCRIPTIONS.CREATED}: ${role.name || role.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:role:list:*");
				roleLogger.info("Role list cache invalidated after creation");
			} catch (cacheError) {
				roleLogger.warn("Failed to invalidate cache after role creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.ROLE.CREATED, role, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			roleLogger.error(`${config.ERROR.ROLE.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, roleLogger);

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

		roleLogger.info(
			`Getting roles, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.UserRoleWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Role", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Role", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [roles, total] = await Promise.all([
				document ? prisma.userRole.findMany(findManyQuery) : [],
				count ? prisma.userRole.count({ where: whereClause }) : 0,
			]);

			roleLogger.info(`Retrieved ${roles.length} roles`);
			const processedData =
				groupBy && document ? groupDataByField(roles, groupBy as string) : roles;

			const responseData: Record<string, any> = {
				...(document && { roles: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ROLE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			roleLogger.error(`${config.ERROR.ROLE.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				roleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				roleLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			roleLogger.info(`${config.SUCCESS.ROLE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:role:byId:${id}:${fields || "full"}`;
			let role = null;

			try {
				if (redisClient.isClientConnected()) {
					role = await redisClient.getJSON(cacheKey);
					if (role) {
						roleLogger.info(`Role ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				roleLogger.warn(`Redis cache retrieval failed for role ${id}:`, cacheError);
			}

			if (!role) {
				const query: Prisma.UserRoleFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				role = await prisma.userRole.findFirst(query);

				if (role && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, role, 3600);
						roleLogger.info(`Role ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						roleLogger.warn(`Failed to store role ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!role) {
				roleLogger.error(`${config.ERROR.ROLE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ROLE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			roleLogger.info(`${config.SUCCESS.ROLE.RETRIEVED}: ${(role as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.ROLE.RETRIEVED, role, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			roleLogger.error(`${config.ERROR.ROLE.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				roleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateRoleSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				roleLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				roleLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			roleLogger.info(`Updating role: ${id}`);

			const existingRole = await prisma.userRole.findFirst({
				where: { id },
			});

			if (!existingRole) {
				roleLogger.error(`${config.ERROR.ROLE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ROLE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedRole = await prisma.userRole.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:role:byId:${id}:*`);
				await invalidateCache.byPattern("cache:role:list:*");
				roleLogger.info(`Cache invalidated after role ${id} update`);
			} catch (cacheError) {
				roleLogger.warn("Failed to invalidate cache after role update:", cacheError);
			}

			roleLogger.info(`${config.SUCCESS.ROLE.UPDATED}: ${updatedRole.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ROLE.UPDATED,
				{ role: updatedRole },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			roleLogger.error(`${config.ERROR.ROLE.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				roleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			roleLogger.info(`${config.SUCCESS.ROLE.DELETED}: ${id}`);

			const existingRole = await prisma.userRole.findFirst({
				where: { id },
			});

			if (!existingRole) {
				roleLogger.error(`${config.ERROR.ROLE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ROLE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.userRole.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:role:byId:${id}:*`);
				await invalidateCache.byPattern("cache:role:list:*");
				roleLogger.info(`Cache invalidated after role ${id} deletion`);
			} catch (cacheError) {
				roleLogger.warn("Failed to invalidate cache after role deletion:", cacheError);
			}

			roleLogger.info(`${config.SUCCESS.ROLE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.ROLE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			roleLogger.error(`${config.ERROR.ROLE.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
