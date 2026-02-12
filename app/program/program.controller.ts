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
import { CreateProgramSchema, UpdateProgramSchema } from "../../zod/program.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const programLogger = logger.child({ module: "program" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			programLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			programLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateProgramSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			programLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const prismaData: Prisma.ProgramUncheckedCreateInput = {
				...validation.data,
				requirements:
					validation.data.requirements === undefined
						? undefined
						: (validation.data.requirements as Prisma.InputJsonValue),
			};

			const program = await prisma.program.create({ data: prismaData });
			programLogger.info(`Program created successfully: ${program.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PROGRAM.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.PROGRAM.DESCRIPTIONS.CREATED}: ${program.name || program.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PROGRAM.PAGES.CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PROGRAM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PROGRAM,
				entityId: program.id,
				changesBefore: null,
				changesAfter: {
					id: program.id,
					name: program.name,
					code: program.code,
					status: program.status,
					totalUnits: program.totalUnits,
					orgId: program.orgId,
					createdAt: program.createdAt,
					updatedAt: program.updatedAt,
				},
				description: `${config.AUDIT_LOG.PROGRAM.DESCRIPTIONS.CREATED}: ${program.name || program.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:program:list:*");
				programLogger.info("Program list cache invalidated after creation");
			} catch (cacheError) {
				programLogger.warn("Failed to invalidate cache after program creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.PROGRAM.CREATED, program, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			programLogger.error(`${config.ERROR.PROGRAM.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, programLogger);

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

		programLogger.info(
			`Getting programs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.ProgramWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["name", "code", "description", "status"];
			if (query) {
				const searchConditions = buildSearchConditions("Program", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Program", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [programs, total] = await Promise.all([
				document ? prisma.program.findMany(findManyQuery) : [],
				count ? prisma.program.count({ where: whereClause }) : 0,
			]);

			programLogger.info(`Retrieved ${programs.length} programs`);
			const processedData =
				groupBy && document ? groupDataByField(programs, groupBy as string) : programs;

			const responseData: Record<string, any> = {
				...(document && { programs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PROGRAM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			programLogger.error(`${config.ERROR.PROGRAM.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				programLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				programLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			programLogger.info(`${config.SUCCESS.PROGRAM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:program:byId:${id}:${fields || "full"}`;
			let program = null;

			try {
				if (redisClient.isClientConnected()) {
					program = await redisClient.getJSON(cacheKey);
					if (program) {
						programLogger.info(`Program ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				programLogger.warn(`Redis cache retrieval failed for program ${id}:`, cacheError);
			}

			if (!program) {
				const query: Prisma.ProgramFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				program = await prisma.program.findFirst(query);

				if (program && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, program, 3600);
						programLogger.info(`Program ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						programLogger.warn(`Failed to store program ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!program) {
				programLogger.error(`${config.ERROR.PROGRAM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PROGRAM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			programLogger.info(`${config.SUCCESS.PROGRAM.RETRIEVED}: ${(program as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PROGRAM.RETRIEVED, program, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			programLogger.error(`${config.ERROR.PROGRAM.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				programLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateProgramSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				programLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				programLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			programLogger.info(`Updating program: ${id}`);

			const existingProgram = await prisma.program.findFirst({
				where: { id },
			});

			if (!existingProgram) {
				programLogger.error(`${config.ERROR.PROGRAM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PROGRAM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData: Prisma.ProgramUncheckedUpdateInput = {
				...validatedData,
				requirements:
					validatedData.requirements === undefined
						? undefined
						: (validatedData.requirements as Prisma.InputJsonValue),
			};

			const updatedProgram = await prisma.program.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:program:byId:${id}:*`);
				await invalidateCache.byPattern("cache:program:list:*");
				programLogger.info(`Cache invalidated after program ${id} update`);
			} catch (cacheError) {
				programLogger.warn("Failed to invalidate cache after program update:", cacheError);
			}

			programLogger.info(`${config.SUCCESS.PROGRAM.UPDATED}: ${updatedProgram.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PROGRAM.UPDATED,
				{ program: updatedProgram },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			programLogger.error(`${config.ERROR.PROGRAM.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				programLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			programLogger.info(`${config.SUCCESS.PROGRAM.DELETED}: ${id}`);

			const existingProgram = await prisma.program.findFirst({
				where: { id },
			});

			if (!existingProgram) {
				programLogger.error(`${config.ERROR.PROGRAM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PROGRAM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.program.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:program:byId:${id}:*`);
				await invalidateCache.byPattern("cache:program:list:*");
				programLogger.info(`Cache invalidated after program ${id} deletion`);
			} catch (cacheError) {
				programLogger.warn("Failed to invalidate cache after program deletion:", cacheError);
			}

			programLogger.info(`${config.SUCCESS.PROGRAM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PROGRAM.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			programLogger.error(`${config.ERROR.PROGRAM.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
