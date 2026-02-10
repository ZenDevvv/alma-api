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
	CreateDeliveryReceiptItemSchema,
	UpdateDeliveryReceiptItemSchema,
} from "../../zod/receipt-item-zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const deliveryReceiptItemLogger = logger.child({ module: "deliveryReceiptItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deliveryReceiptItemLogger.info(
				"Original form data:",
				JSON.stringify(req.body, null, 2),
			);
			requestData = transformFormDataToObject(req.body);
			deliveryReceiptItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeliveryReceiptItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			deliveryReceiptItemLogger.error(
				`Validation failed: ${JSON.stringify(formattedErrors)}`,
			);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const deliveryReceiptItem = await prisma.receiptItem.create({
				data: validation.data,
			});
			deliveryReceiptItemLogger.info(
				`DeliveryReceiptItem created successfully: ${deliveryReceiptItem.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DELIVERYRECEIPTITEM.ACTIONS.CREATE_DELIVERYRECEIPTITEM,
				description: `${config.ACTIVITY_LOG.DELIVERYRECEIPTITEM.DESCRIPTIONS.DELIVERYRECEIPTITEM_CREATED}: ${deliveryReceiptItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DELIVERYRECEIPTITEM.PAGES
						.DELIVERYRECEIPTITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DELIVERYRECEIPTITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DELIVERYRECEIPTITEM,
				entityId: deliveryReceiptItem.id,
				changesBefore: null,
				changesAfter: {
					id: deliveryReceiptItem.id,

					createdAt: deliveryReceiptItem.createdAt,
					updatedAt: deliveryReceiptItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.DELIVERYRECEIPTITEM.DESCRIPTIONS.DELIVERYRECEIPTITEM_CREATED}: ${deliveryReceiptItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:deliveryReceiptItem:list:*");
				deliveryReceiptItemLogger.info(
					"DeliveryReceiptItem list cache invalidated after creation",
				);
			} catch (cacheError) {
				deliveryReceiptItemLogger.warn(
					"Failed to invalidate cache after deliveryReceiptItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPTITEM.CREATED,
				deliveryReceiptItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			deliveryReceiptItemLogger.error(
				`${config.ERROR.DELIVERYRECEIPTITEM.CREATE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deliveryReceiptItemLogger);

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

		deliveryReceiptItemLogger.info(
			`Getting deliveryReceiptItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ReceiptItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"DeliveryReceiptItem",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DeliveryReceiptItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [deliveryReceiptItems, total] = await Promise.all([
				document ? prisma.receiptItem.findMany(findManyQuery) : [],
				count ? prisma.receiptItem.count({ where: whereClause }) : 0,
			]);

			deliveryReceiptItemLogger.info(
				`Retrieved ${deliveryReceiptItems.length} deliveryReceiptItems`,
			);
			const processedData =
				groupBy && document
					? groupDataByField(deliveryReceiptItems, groupBy as string)
					: deliveryReceiptItems;

			const responseData: Record<string, any> = {
				...(document && { deliveryReceiptItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.DELIVERYRECEIPTITEM.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			deliveryReceiptItemLogger.error(
				`${config.ERROR.DELIVERYRECEIPTITEM.GET_ALL_FAILED}: ${error}`,
			);
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
				deliveryReceiptItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deliveryReceiptItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryReceiptItemLogger.info(
				`${config.SUCCESS.DELIVERYRECEIPTITEM.GETTING_BY_ID}: ${id}`,
			);

			const cacheKey = `cache:deliveryReceiptItem:byId:${id}:${fields || "full"}`;
			let deliveryReceiptItem = null;

			try {
				if (redisClient.isClientConnected()) {
					deliveryReceiptItem = await redisClient.getJSON(cacheKey);
					if (deliveryReceiptItem) {
						deliveryReceiptItemLogger.info(
							`DeliveryReceiptItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				deliveryReceiptItemLogger.warn(
					`Redis cache retrieval failed for deliveryReceiptItem ${id}:`,
					cacheError,
				);
			}

			if (!deliveryReceiptItem) {
				const query: Prisma.ReceiptItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				deliveryReceiptItem = await prisma.receiptItem.findFirst(query);

				if (deliveryReceiptItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, deliveryReceiptItem, 3600);
						deliveryReceiptItemLogger.info(
							`DeliveryReceiptItem ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						deliveryReceiptItemLogger.warn(
							`Failed to store deliveryReceiptItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!deliveryReceiptItem) {
				deliveryReceiptItemLogger.error(
					`${config.ERROR.DELIVERYRECEIPTITEM.NOT_FOUND}: ${id}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYRECEIPTITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			deliveryReceiptItemLogger.info(
				`${config.SUCCESS.DELIVERYRECEIPTITEM.RETRIEVED}: ${(deliveryReceiptItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPTITEM.RETRIEVED,
				deliveryReceiptItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryReceiptItemLogger.error(
				`${config.ERROR.DELIVERYRECEIPTITEM.ERROR_GETTING}: ${error}`,
			);
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
				deliveryReceiptItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeliveryReceiptItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deliveryReceiptItemLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryReceiptItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deliveryReceiptItemLogger.info(`Updating deliveryReceiptItem: ${id}`);

			const existingDeliveryReceiptItem = await prisma.receiptItem.findFirst({
				where: { id },
			});

			if (!existingDeliveryReceiptItem) {
				deliveryReceiptItemLogger.error(
					`${config.ERROR.DELIVERYRECEIPTITEM.NOT_FOUND}: ${id}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYRECEIPTITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedDeliveryReceiptItem = await prisma.receiptItem.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryReceiptItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryReceiptItem:list:*");
				deliveryReceiptItemLogger.info(
					`Cache invalidated after deliveryReceiptItem ${id} update`,
				);
			} catch (cacheError) {
				deliveryReceiptItemLogger.warn(
					"Failed to invalidate cache after deliveryReceiptItem update:",
					cacheError,
				);
			}

			deliveryReceiptItemLogger.info(
				`${config.SUCCESS.DELIVERYRECEIPTITEM.UPDATED}: ${updatedDeliveryReceiptItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPTITEM.UPDATED,
				{ deliveryReceiptItem: updatedDeliveryReceiptItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryReceiptItemLogger.error(
				`${config.ERROR.DELIVERYRECEIPTITEM.ERROR_UPDATING}: ${error}`,
			);
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
				deliveryReceiptItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryReceiptItemLogger.info(`${config.SUCCESS.DELIVERYRECEIPTITEM.DELETED}: ${id}`);

			const existingDeliveryReceiptItem = await prisma.receiptItem.findFirst({
				where: { id },
			});

			if (!existingDeliveryReceiptItem) {
				deliveryReceiptItemLogger.error(
					`${config.ERROR.DELIVERYRECEIPTITEM.NOT_FOUND}: ${id}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.DELIVERYRECEIPTITEM.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.receiptItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryReceiptItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryReceiptItem:list:*");
				deliveryReceiptItemLogger.info(
					`Cache invalidated after deliveryReceiptItem ${id} deletion`,
				);
			} catch (cacheError) {
				deliveryReceiptItemLogger.warn(
					"Failed to invalidate cache after deliveryReceiptItem deletion:",
					cacheError,
				);
			}

			deliveryReceiptItemLogger.info(`${config.SUCCESS.DELIVERYRECEIPTITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYRECEIPTITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryReceiptItemLogger.error(
				`${config.ERROR.DELIVERYRECEIPTITEM.DELETE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
