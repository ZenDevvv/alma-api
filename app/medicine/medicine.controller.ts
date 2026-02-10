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
import { CreateMedicineSchema, UpdateMedicineSchema } from "../../zod/medicine.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const medicineLogger = logger.child({ module: "medicine" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			medicineLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			medicineLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateMedicineSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			medicineLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const medicine = await prisma.medicine.create({ data: validation.data });
			medicineLogger.info(`Medicine created successfully: ${medicine.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.MEDICINE.ACTIONS.CREATE_MEDICINE,
				description: `${config.ACTIVITY_LOG.MEDICINE.DESCRIPTIONS.MEDICINE_CREATED}: ${medicine.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.MEDICINE.PAGES.MEDICINE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.MEDICINE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.MEDICINE,
				entityId: medicine.id,
				changesBefore: null,
				changesAfter: {
					id: medicine.id,
					createdAt: medicine.createdAt,
					updatedAt: medicine.updatedAt,
				},
				description: `${config.AUDIT_LOG.MEDICINE.DESCRIPTIONS.MEDICINE_CREATED}: ${medicine.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:medicine:list:*");
				medicineLogger.info("Medicine list cache invalidated after creation");
			} catch (cacheError) {
				medicineLogger.warn(
					"Failed to invalidate cache after medicine creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.MEDICINE.CREATED,
				medicine,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			medicineLogger.error(`${config.ERROR.MEDICINE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, medicineLogger);

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

		medicineLogger.info(
			`Getting medicines, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.MedicineWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Medicine", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Medicine", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [medicines, total] = await Promise.all([
				document ? prisma.medicine.findMany(findManyQuery) : [],
				count ? prisma.medicine.count({ where: whereClause }) : 0,
			]);

			medicineLogger.info(`Retrieved ${medicines.length} medicines`);
			const processedData =
				groupBy && document ? groupDataByField(medicines, groupBy as string) : medicines;

			const responseData: Record<string, any> = {
				...(document && { medicines: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.MEDICINE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			medicineLogger.error(`${config.ERROR.MEDICINE.GET_ALL_FAILED}: ${error}`);
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
				medicineLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				medicineLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			medicineLogger.info(`${config.SUCCESS.MEDICINE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:medicine:byId:${id}:${fields || "full"}`;
			let medicine = null;

			try {
				if (redisClient.isClientConnected()) {
					medicine = await redisClient.getJSON(cacheKey);
					if (medicine) {
						medicineLogger.info(`Medicine ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				medicineLogger.warn(`Redis cache retrieval failed for medicine ${id}:`, cacheError);
			}

			if (!medicine) {
				const query: Prisma.MedicineFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				medicine = await prisma.medicine.findFirst(query);

				if (medicine && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, medicine, 3600);
						medicineLogger.info(`Medicine ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						medicineLogger.warn(
							`Failed to store medicine ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!medicine) {
				medicineLogger.error(`${config.ERROR.MEDICINE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.MEDICINE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			medicineLogger.info(`${config.SUCCESS.MEDICINE.RETRIEVED}: ${(medicine as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.MEDICINE.RETRIEVED,
				medicine,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			medicineLogger.error(`${config.ERROR.MEDICINE.ERROR_GETTING}: ${error}`);
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
				medicineLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateMedicineSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				medicineLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				medicineLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			medicineLogger.info(`Updating medicine: ${id}`);

			const existingMedicine = await prisma.medicine.findFirst({
				where: { id },
			});

			if (!existingMedicine) {
				medicineLogger.error(`${config.ERROR.MEDICINE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.MEDICINE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedMedicine = await prisma.medicine.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:medicine:byId:${id}:*`);
				await invalidateCache.byPattern("cache:medicine:list:*");
				medicineLogger.info(`Cache invalidated after medicine ${id} update`);
			} catch (cacheError) {
				medicineLogger.warn(
					"Failed to invalidate cache after medicine update:",
					cacheError,
				);
			}

			medicineLogger.info(`${config.SUCCESS.MEDICINE.UPDATED}: ${updatedMedicine.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.MEDICINE.UPDATED,
				{ medicine: updatedMedicine },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			medicineLogger.error(`${config.ERROR.MEDICINE.ERROR_UPDATING}: ${error}`);
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
				medicineLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			medicineLogger.info(`${config.SUCCESS.MEDICINE.DELETED}: ${id}`);

			const existingMedicine = await prisma.medicine.findFirst({
				where: { id },
			});

			if (!existingMedicine) {
				medicineLogger.error(`${config.ERROR.MEDICINE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.MEDICINE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.medicine.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:medicine:byId:${id}:*`);
				await invalidateCache.byPattern("cache:medicine:list:*");
				medicineLogger.info(`Cache invalidated after medicine ${id} deletion`);
			} catch (cacheError) {
				medicineLogger.warn(
					"Failed to invalidate cache after medicine deletion:",
					cacheError,
				);
			}

			medicineLogger.info(`${config.SUCCESS.MEDICINE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.MEDICINE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			medicineLogger.error(`${config.ERROR.MEDICINE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
