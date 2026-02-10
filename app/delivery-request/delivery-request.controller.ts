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
import {
	CreateDeliverySchema,
	DeliveryRequest,
	UpdateDeliverySchema,
} from "../../zod/delivery-request.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { generateNextNumber } from "../../helper/generateDeliverCode";
import { AuthRequest } from "../../middleware/verifyToken";
import { controller as deliveryItem } from "../deliveryItem/deliveryItem.controller";

const logger = getLogger();
const deliveryLogger = logger.child({ module: "delivery" });

export const controller = (prisma: PrismaClient) => {
	const test = deliveryItem(prisma);
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deliveryLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deliveryLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeliverySchema.safeParse(requestData);

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			console.log("Error :", formattedErrors);
			deliveryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const { items, ...rest } = validation.data;

			if (!req.userId) {
				const errorResponse = buildErrorResponse("User ID not found in request!", 401);
				res.status(401).json(errorResponse);
				return;
			}

			if (!rest.sourceId && !rest.supplierId) {
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.SUPPLIER_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const departmentId = req.departmentId;
			const userId = req.userId;

			const delivery = await prisma.$transaction(async (tx) => {
				const requestResult = await generateNextNumber(prisma, "deliveryRequest", {
					prefix: "DRQ",
					digits: 4,
				});

				return await tx.deliveryRequest.create({
					data: {
						...rest,
						destinationId: departmentId!,
						requestNumber: requestResult.number,
						sequence: requestResult.sequence,
						year: requestResult.year,
						requestedById: userId,
						orgId: req.orgId,
					},
					include: {
						items: true,
					},
				});
			});

			await prisma.requestItem.createMany({
				data: items.map((item) => ({
					...item,
					requestId: delivery.id,
					itemStatus: "pending",
				})),
			});

			deliveryLogger.info(`Delivery created successfully: ${delivery.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DELIVERY.ACTIONS.CREATE_DELIVERY,
				description: `${config.ACTIVITY_LOG.DELIVERY.DESCRIPTIONS.DELIVERY_CREATED}: ${delivery.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DELIVERY.PAGES.DELIVERY_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DELIVERY,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DELIVERY,
				entityId: delivery.id,
				changesBefore: null,
				changesAfter: {
					id: delivery.id,
					createdAt: delivery.createdAt,
					updatedAt: delivery.updatedAt,
				},
				description: `${config.AUDIT_LOG.DELIVERY.DESCRIPTIONS.DELIVERY_CREATED}: ${delivery.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:delivery:list:*");
				deliveryLogger.info("Delivery list cache invalidated after creation");
			} catch (cacheError) {
				deliveryLogger.warn(
					"Failed to invalidate cache after delivery creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERY.CREATED,
				delivery,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			deliveryLogger.error(`${config.ERROR.DELIVERY.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deliveryLogger);

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

		deliveryLogger.info(
			`Getting deliverys, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DeliveryRequestWhereInput = {
				isDeleted: false,
				...(req.orgId && { orgId: req.orgId }),
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"DeliveryRequest",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DeliveryRequest", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [deliverys, total] = await Promise.all([
				document ? prisma.deliveryRequest.findMany(findManyQuery) : [],
				count ? prisma.deliveryRequest.count({ where: whereClause }) : 0,
			]);

			deliveryLogger.info(`Retrieved ${deliverys.length} delivery requests`);
			const processedData =
				groupBy && document ? groupDataByField(deliverys, groupBy as string) : deliverys;

			const responseData: Record<string, any> = {
				...(document && { deliverys: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DELIVERY.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			deliveryLogger.error(`${config.ERROR.DELIVERY.GET_ALL_FAILED}: ${error}`);
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
				deliveryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deliveryLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryLogger.info(`${config.SUCCESS.DELIVERY.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:delivery:byId:${id}:${fields || "full"}`;
			let delivery = null;

			try {
				if (redisClient.isClientConnected()) {
					delivery = await redisClient.getJSON(cacheKey);
					if (delivery) {
						deliveryLogger.info(`Delivery ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				deliveryLogger.warn(`Redis cache retrieval failed for delivery ${id}:`, cacheError);
			}

			if (!delivery) {
				const query: Prisma.DeliveryRequestFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				delivery = await prisma.deliveryRequest.findFirst(query);

				if (delivery && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, delivery, 3600);
						deliveryLogger.info(`Delivery ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						deliveryLogger.warn(
							`Failed to store delivery ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!delivery) {
				deliveryLogger.error(`${config.ERROR.DELIVERY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			deliveryLogger.info(`${config.SUCCESS.DELIVERY.RETRIEVED}: ${(delivery as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERY.RETRIEVED,
				delivery,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryLogger.error(`${config.ERROR.DELIVERY.ERROR_GETTING}: ${error}`);
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
				deliveryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeliverySchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deliveryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deliveryLogger.info(`Updating delivery: ${id}`);

			const existingDelivery = await prisma.deliveryRequest.findFirst({
				where: { id },
			});

			if (!existingDelivery) {
				deliveryLogger.error(`${config.ERROR.DELIVERY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const { items, destinationId, ...prismaData } = validatedData;

			// Handle nullable fields properly for Prisma
			const updateData: any = { ...prismaData };

			// Remove undefined values and handle null explicitly
			Object.keys(updateData).forEach((key) => {
				if (updateData[key] === undefined) {
					delete updateData[key];
				}
			});

			const updatedDelivery = await prisma.deliveryRequest.update({
				where: { id },
				data: updateData,
			});

			try {
				await invalidateCache.byPattern(`cache:delivery:byId:${id}:*`);
				await invalidateCache.byPattern("cache:delivery:list:*");
				deliveryLogger.info(`Cache invalidated after delivery ${id} update`);
			} catch (cacheError) {
				deliveryLogger.warn(
					"Failed to invalidate cache after delivery update:",
					cacheError,
				);
			}

			deliveryLogger.info(`${config.SUCCESS.DELIVERY.UPDATED}: ${updatedDelivery.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERY.UPDATED,
				{ delivery: updatedDelivery },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryLogger.error(`${config.ERROR.DELIVERY.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const approvedUpdate = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deliveryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}
			console.log("Body : ", req.body);
			const validationResult = UpdateDeliverySchema.safeParse(req.body);

			if (!validationResult.success) {
				console.log("Error", validationResult);
				const formattedErrors = formatZodErrors(validationResult.error.format());
				console.log("Formatted Error : ", formattedErrors);
				deliveryLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deliveryLogger.info(`Updating delivery: ${id}`);

			const existingDelivery = await prisma.deliveryRequest.findFirst({
				where: { id },
			});

			if (!existingDelivery) {
				deliveryLogger.error(`${config.ERROR.DELIVERY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const { items, destinationId, ...prismaData } = validatedData;

			// Handle nullable fields properly for Prisma
			const updateData: any = { ...prismaData };

			// Remove undefined values and handle null explicitly
			Object.keys(updateData).forEach((key) => {
				if (updateData[key] === undefined) {
					delete updateData[key];
				}
			});

			const updatedDelivery = await prisma.deliveryRequest.update({
				where: { id },
				data: updateData,
			});
			await bulkUpdateDeliveryItems(items);
			try {
				await invalidateCache.byPattern(`cache:delivery:byId:${id}:*`);
				await invalidateCache.byPattern("cache:delivery:list:*");
				deliveryLogger.info(`Cache invalidated after delivery ${id} update`);
			} catch (cacheError) {
				deliveryLogger.warn(
					"Failed to invalidate cache after delivery update:",
					cacheError,
				);
			}

			deliveryLogger.info(`${config.SUCCESS.DELIVERY.UPDATED}: ${updatedDelivery.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERY.UPDATED,
				{ delivery: updatedDelivery },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryLogger.error(`${config.ERROR.DELIVERY.ERROR_UPDATING}: ${error}`);
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
				deliveryLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryLogger.info(`${config.SUCCESS.DELIVERY.DELETED}: ${id}`);

			const existingDelivery = await prisma.deliveryRequest.findFirst({
				where: { id },
			});

			if (!existingDelivery) {
				deliveryLogger.error(`${config.ERROR.DELIVERY.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERY.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.deliveryRequest.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:delivery:byId:${id}:*`);
				await invalidateCache.byPattern("cache:delivery:list:*");
				deliveryLogger.info(`Cache invalidated after delivery ${id} deletion`);
			} catch (cacheError) {
				deliveryLogger.warn(
					"Failed to invalidate cache after delivery deletion:",
					cacheError,
				);
			}

			deliveryLogger.info(`${config.SUCCESS.DELIVERY.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.DELIVERY.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryLogger.error(`${config.ERROR.DELIVERY.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const bulkUpdateDeliveryItems = async (updates?: Array<any>) => {
		// Return early if no updates
		if (!updates || !Array.isArray(updates) || updates.length === 0) {
			return [];
		}

		// Validate each item has an id
		const invalidItems = updates.filter((item) => !item.id);
		if (invalidItems.length > 0) {
			throw new Error("All items must have an id field.");
		}

		// Use Prisma transaction for atomic updates
		const results = await prisma.$transaction(
			updates.map((item) => {
				const { id, expiryDate, ...updateData } = item;

				return prisma.requestItem.update({
					where: { id },
					data: {
						...updateData,
						...(expiryDate && { expiryDate: new Date(expiryDate) }),
					},
				});
			}),
		);

		return results;
	};
	return { create, getAll, getById, update, approvedUpdate, remove };
};
