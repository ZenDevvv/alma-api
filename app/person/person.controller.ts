import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { config } from "../../config/constant";
import { buildErrorResponse, formatZodErrors, handlePrismaError } from "../../helper/error-handler";
import { buildPagination, buildSuccessResponse } from "../../helper/success-handler";
import { CreatePersonSchema } from "../../zod/person.zod";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	getNestedFields,
} from "../../helper/query-builder";

import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { ObjectIdSchema } from "../../zod/object-id.zod";

const logger = getLogger();
const personLogger = logger.child({ module: "person" });

export const controller = (prisma: PrismaClient) => {
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		const idValidation = ObjectIdSchema.safeParse(id);

		if (!idValidation.success) {
			personLogger.error(config.ERROR.QUERY_PARAMS.INVALID_ID);
			const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.INVALID_ID, 400);
			res.status(400).json(errorResponse);
			return;
		}

		if (fields && typeof fields !== "string") {
			personLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
				400,
			);
			res.status(400).json(errorResponse);
			return;
		}

		personLogger.info(`${config.SUCCESS.PERSON.GETTING_USER_BY_ID}: ${id}`);

		try {
			const cacheKey = `cache:person:byId:${id}:${fields || "full"}`;
			let person: any = null;
			try {
				if (redisClient.isClientConnected()) {
					person = await redisClient.getJSON(cacheKey);
					if (person) {
						personLogger.info(`Person ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				personLogger.warn(`Redis cache retrieval failed for person ${id}:`, cacheError);
			}

			if (!person) {
				const query: Prisma.PersonFindFirstArgs = {
					where: {
						id,
					},
				};

				query.select = getNestedFields(fields);

				person = await prisma.person.findFirst(query);

				if (person && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, person, 3600);
						personLogger.info(`Person ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						personLogger.warn(
							`Failed to store person ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!person) {
				personLogger.error(`${config.ERROR.PERSON.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PERSON.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// ✅ Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_PERSON",
				description: `Retrieved person with ID: ${id}`,
				page: { url: req.originalUrl, title: "Get Person Details" },
			});

			personLogger.info(`${config.SUCCESS.PERSON.RETRIEVED}: ${person.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PERSON.RETRIEVED,
				{ person },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			personLogger.error(`${config.ERROR.PERSON.ERROR_GETTING_USER}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, personLogger);

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

		personLogger.info(
			`${config.SUCCESS.PERSON.GETTING_ALL_USERS}, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, filter: ${JSON.stringify(filter)}`,
		);

		try {
			// Create cache key based on query parameters
			const cacheParams = {
				page,
				limit,
				order,
				fields,
				sort,
				query,
				document,
				pagination,
				count,
				filter,
				groupBy,
			};
			const cacheKey = `cache:person:list:${Buffer.from(JSON.stringify(cacheParams)).toString("base64")}`;

			let cachedData = null;
			try {
				if (redisClient.isClientConnected()) {
					cachedData = await redisClient.getJSON(cacheKey);
					if (cachedData) {
						personLogger.info(`Person list retrieved from Redis cache`);
						res.status(200).json(
							buildSuccessResponse(config.SUCCESS.PERSON.RETRIEVED, cachedData, 200),
						);
						return;
					}
				}
			} catch (cacheError) {
				personLogger.warn(`Redis cache retrieval failed for person list:`, cacheError);
			}

			// Base where clause
			const whereClause: Prisma.PersonWhereInput = {
				...(query
					? {
							OR: [
								{
									personalInfo: {
										is: { firstName: { contains: String(query) } },
									},
								},
								{ personalInfo: { is: { lastName: { contains: String(query) } } } },
								{
									personalInfo: {
										is: { middleName: { contains: String(query) } },
									},
								},
							],
						}
					: {}),
			};

			if (filter) {
				const filterConditions = buildFilterConditions("Person", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [person, total] = await Promise.all([
				document ? prisma.person.findMany(findManyQuery) : [],
				count ? prisma.person.count({ where: whereClause }) : 0,
			]);

			personLogger.info(`Retrieved ${person.length} person`);
			const responseData = {
				...(document && { person }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			// Cache the response data
			if (redisClient.isClientConnected()) {
				try {
					await redisClient.setJSON(cacheKey, responseData, 3600);
					personLogger.info(`Person list stored in Redis cache`);
				} catch (cacheError) {
					personLogger.warn(`Failed to store person list in Redis cache:`, cacheError);
				}
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_ALL_PERSONS",
				description: `Retrieved ${responseData.person?.length || responseData.person?.length || 0} person records`,
				page: { url: req.originalUrl, title: "Get All Persons" },
			});

			personLogger.info(`Retrieved person records successfully`);
			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PERSON.RETRIEVED, responseData, 200),
			);
		} catch (error: any) {
			personLogger.error(`${config.ERROR.PERSON.ERROR_GETTING_USER}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const validationResult = CreatePersonSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				personLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;
			const existingPerson = await prisma.person.findFirst({
				where: {
					personalInfo: {
						is: {
							firstName: validatedData.personalInfo?.firstName,
							lastName: validatedData.personalInfo?.lastName,
						},
					},
				},
			});

			if (existingPerson) {
				personLogger.info(`${config.SUCCESS.PERSON.RETRIEVED}: ${existingPerson.id}`);
				const successResponse = buildSuccessResponse(
					"Existing person found",
					{ person: existingPerson },
					200,
				);
				res.status(200).json(successResponse);
				return;
			}

			// Map Zod gender (lowercase) to Prisma enum (uppercase)
			const personalInfoForPrisma = {
				...validatedData.personalInfo,
				...(validatedData.personalInfo?.gender && {
					gender: (validatedData.personalInfo.gender as string).toUpperCase() as any,
				}),
			} as any;

			const newPerson = await prisma.person.create({
				data: {
					personalInfo: personalInfoForPrisma,
					documents: validatedData.documents as any,
				},
			});

			// Link the created person to the authenticated user (set user.personId)
			try {
				const authUserId = (req as any).userId as string | undefined;
				personLogger.info(
					`Attempting to link person ${newPerson.id} to auth userId=${authUserId}`,
				);
				if (authUserId) {
					const userRecord = await prisma.user.findUnique({
						where: { id: authUserId },
						select: { id: true, personId: true },
					});
					personLogger.info(`Fetched userRecord: ${JSON.stringify(userRecord)}`);
					if (userRecord && !userRecord.personId) {
						const updated = await prisma.user.update({
							where: { id: userRecord.id },
							data: { personId: newPerson.id },
						});
						personLogger.info(
							`Linked user ${updated.id} to personId ${updated.personId}`,
						);
					} else if (userRecord?.personId) {
						personLogger.info(
							`User ${userRecord.id} already linked to personId ${userRecord.personId}`,
						);
					} else {
						personLogger.warn(`No user found for authUserId=${authUserId}`);
					}
				} else {
					personLogger.warn("No auth userId on request; skipping user-person link");
				}
			} catch (linkErr) {
				personLogger.warn(
					"Failed to link created person to authenticated user",
					linkErr as any,
				);
			}

			// ✅ Log activity for creation
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_PERSON",
				description: `Created new person: ${validatedData.personalInfo?.firstName} ${validatedData.personalInfo?.lastName}`,
				page: { url: req.originalUrl, title: "Person Creation" },
			});

			// ✅ Log audit for creation
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE",
				resource: "persons",
				severity: "LOW",
				entityType: "person",
				entityId: newPerson.id,
				changesBefore: null,
				changesAfter: {
					personalInfo: newPerson.personalInfo,
				},
				description: `Created new person: ${validatedData.personalInfo?.firstName} ${validatedData.personalInfo?.lastName}`,
			});

			personLogger.info(`${config.SUCCESS.PERSON.CREATED}: ${newPerson.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PERSON.CREATED,
				newPerson,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error: any) {
			personLogger.error(`${config.ERROR.PERSON.INTERNAL_SERVER_ERROR}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			const idValidation = ObjectIdSchema.safeParse(id);

			if (!idValidation.success) {
				personLogger.error(config.ERROR.QUERY_PARAMS.INVALID_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.INVALID_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate the request body using Zod
			const validationResult = CreatePersonSchema.partial().safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				personLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				personLogger.error(config.ERROR.PERSON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(
					config.ERROR.PERSON.AT_LEAST_ONE_FIELD_REQUIRED,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}
			const validatedData = validationResult.data;

			personLogger.info(`Updating person: ${id}`);

			const existingPerson = await prisma.person.findFirst({
				where: {
					id,
				},
			});
			if (!existingPerson) {
				personLogger.error(`${config.ERROR.PERSON.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PERSON.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Map gender if present on update
			const updatePersonalInfo = validatedData.personalInfo
				? {
						...validatedData.personalInfo,
						...(validatedData.personalInfo.gender && {
							gender: (
								validatedData.personalInfo.gender as string
							).toUpperCase() as any,
						}),
					}
				: undefined;

			const updatedPerson = await prisma.person.update({
				where: { id },
				data: {
					...(updatePersonalInfo && {
						personalInfo: updatePersonalInfo as any,
					}),
					...(validatedData.documents && {
						documents: validatedData.documents as any,
					}),
				},
			});
			try {
				await invalidateCache.byPattern(`cache:person:byId:${id}:*`);
				await invalidateCache.byPattern("cache:person:list:*");
				personLogger.info(`Cache invalidated after person ${id} update`);
			} catch (cacheError) {
				personLogger.warn("Failed to invalidate cache after person update:", cacheError);
			}
			// ✅ Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "UPDATE_PERSON",
				description: `Updated person with ID: ${id}`,
				page: { url: req.originalUrl, title: "Person Update" },
			});

			// ✅ Log audit for update
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: "UPDATE",
				resource: "persons",
				severity: "MEDIUM",
				entityType: "person",
				entityId: id,
				changesBefore: {
					personalInfo: existingPerson.personalInfo,
					...validatedData,
				},
				changesAfter: {
					personalInfo: updatedPerson.personalInfo,
				},
				description: `Updated person with ID: ${id}`,
			});

			personLogger.info(`${config.SUCCESS.PERSON.UPDATED}: ${updatedPerson.id}`);
			res.status(200).json(updatedPerson);
		} catch (error: any) {
			personLogger.error(`${config.ERROR.PERSON.ERROR_UPDATING_USER}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		const idValidation = ObjectIdSchema.safeParse(id);

		if (!idValidation.success) {
			personLogger.error(config.ERROR.QUERY_PARAMS.INVALID_ID);
			const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.INVALID_ID, 400);
			res.status(400).json(errorResponse);
			return;
		}

		personLogger.info(`${config.SUCCESS.PERSON.SOFT_DELETING}: ${id}`);

		try {
			const existingUser = await prisma.person.findUnique({
				where: {
					id,
				},
			});

			if (!existingUser) {
				personLogger.error(`${config.ERROR.PERSON.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PERSON.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Hard delete the person record
			await prisma.person.delete({
				where: { id },
			});
			try {
				await invalidateCache.byPattern(`cache:person:byId:${id}:*`);
				await invalidateCache.byPattern("cache:person:list:*");
				personLogger.info(`Cache invalidated after person ${id} deletion`);
			} catch (cacheError) {
				personLogger.warn("Failed to invalidate cache after person deletion:", cacheError);
			}

			// ✅ Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "DELETE_PERSON",
				description: `Soft deleted person with ID: ${id}`,
				page: { url: req.originalUrl, title: "Person Deletion" },
			});

			// ✅ Log audit for deletion
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: "DELETE",
				resource: "persons",
				severity: "HIGH",
				entityType: "person",
				entityId: id,
				changesBefore: {
					personalInfo: (existingUser as any).personalInfo,
				},
				changesAfter: {
					// Reflect deletion action without metadata diff
				},
				description: `Soft deleted person with ID: ${id}`,
			});

			personLogger.info(`${config.SUCCESS.PERSON.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PERSON.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error: any) {
			personLogger.error(`${config.ERROR.PERSON.ERROR_DELETING_USER}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return {
		getById,
		getAll,
		create,
		update,
		remove,
	};
};
