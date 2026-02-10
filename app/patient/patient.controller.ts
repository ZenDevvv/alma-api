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
import { CreatePatientSchema, UpdatePatientSchema } from "../../zod/patient.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const patientLogger = logger.child({ module: "patient" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			patientLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			patientLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreatePatientSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			patientLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const patient = await prisma.patient.create({ data: validation.data });
			patientLogger.info(`Patient created successfully: ${patient.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PATIENT.ACTIONS.CREATE_PATIENT,
				description: `${config.ACTIVITY_LOG.PATIENT.DESCRIPTIONS.PATIENT_CREATED}: ${patient.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PATIENT.PAGES.PATIENT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PATIENT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PATIENT,
				entityId: patient.id,
				changesBefore: null,
				changesAfter: {
					id: patient.id,

					createdAt: patient.createdAt,
					updatedAt: patient.updatedAt,
				},
				description: `${config.AUDIT_LOG.PATIENT.DESCRIPTIONS.PATIENT_CREATED}: ${patient.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:patient:list:*");
				patientLogger.info("Patient list cache invalidated after creation");
			} catch (cacheError) {
				patientLogger.warn(
					"Failed to invalidate cache after patient creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.PATIENT.CREATED,
				patient,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			patientLogger.error(`${config.ERROR.PATIENT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, patientLogger);

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

		patientLogger.info(
			`Getting patients, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.PatientWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Patient", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Patient", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [patients, total] = await Promise.all([
				document ? prisma.patient.findMany(findManyQuery) : [],
				count ? prisma.patient.count({ where: whereClause }) : 0,
			]);

			patientLogger.info(`Retrieved ${patients.length} patients`);
			const processedData =
				groupBy && document ? groupDataByField(patients, groupBy as string) : patients;

			const responseData: Record<string, any> = {
				...(document && { patients: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PATIENT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			patientLogger.error(`${config.ERROR.PATIENT.GET_ALL_FAILED}: ${error}`);
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
				patientLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				patientLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			patientLogger.info(`${config.SUCCESS.PATIENT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:patient:byId:${id}:${fields || "full"}`;
			let patient = null;

			try {
				if (redisClient.isClientConnected()) {
					patient = await redisClient.getJSON(cacheKey);
					if (patient) {
						patientLogger.info(`Patient ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				patientLogger.warn(`Redis cache retrieval failed for patient ${id}:`, cacheError);
			}

			if (!patient) {
				const query: Prisma.PatientFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				patient = await prisma.patient.findFirst(query);

				if (patient && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, patient, 3600);
						patientLogger.info(`Patient ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						patientLogger.warn(
							`Failed to store patient ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!patient) {
				patientLogger.error(`${config.ERROR.PATIENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PATIENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			patientLogger.info(`${config.SUCCESS.PATIENT.RETRIEVED}: ${(patient as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PATIENT.RETRIEVED,
				patient,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			patientLogger.error(`${config.ERROR.PATIENT.ERROR_GETTING}: ${error}`);
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
				patientLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdatePatientSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				patientLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				patientLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			patientLogger.info(`Updating patient: ${id}`);

			const existingPatient = await prisma.patient.findFirst({
				where: { id },
			});

			if (!existingPatient) {
				patientLogger.error(`${config.ERROR.PATIENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PATIENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedPatient = await prisma.patient.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:patient:byId:${id}:*`);
				await invalidateCache.byPattern("cache:patient:list:*");
				patientLogger.info(`Cache invalidated after patient ${id} update`);
			} catch (cacheError) {
				patientLogger.warn("Failed to invalidate cache after patient update:", cacheError);
			}

			patientLogger.info(`${config.SUCCESS.PATIENT.UPDATED}: ${updatedPatient.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PATIENT.UPDATED,
				{ patient: updatedPatient },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			patientLogger.error(`${config.ERROR.PATIENT.ERROR_UPDATING}: ${error}`);
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
				patientLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			patientLogger.info(`${config.SUCCESS.PATIENT.DELETED}: ${id}`);

			const existingPatient = await prisma.patient.findFirst({
				where: { id },
			});

			if (!existingPatient) {
				patientLogger.error(`${config.ERROR.PATIENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PATIENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.patient.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:patient:byId:${id}:*`);
				await invalidateCache.byPattern("cache:patient:list:*");
				patientLogger.info(`Cache invalidated after patient ${id} deletion`);
			} catch (cacheError) {
				patientLogger.warn(
					"Failed to invalidate cache after patient deletion:",
					cacheError,
				);
			}

			patientLogger.info(`${config.SUCCESS.PATIENT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PATIENT.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			patientLogger.error(`${config.ERROR.PATIENT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
