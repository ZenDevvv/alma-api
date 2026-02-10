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
import { CreateDeliveryOrderSchema, UpdateDeliveryOrderSchema } from "../../zod/delivery-order.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";
import { ObjectId } from "mongodb";
import { createWithoutRequest, createWithRequest } from "../../helper/request-helper";

const logger = getLogger();
const deliveryOrderLogger = logger.child({ module: "deliveryOrder" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deliveryOrderLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deliveryOrderLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeliveryOrderSchema.safeParse(requestData);
		if (!validation.success) {
			console.log(validation.error);
			const formattedErrors = formatZodErrors(validation.error.format());
			deliveryOrderLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		if (validation.data.type === "without_request") {
			if (!validation.data.sourceId) {
				const errorResponse = buildErrorResponse(
					"Either supplierId or sourceId is required for type 'without_request'",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const itemsWithoutProductId = validation.data.items.filter((item) => !item.productId);

			if (itemsWithoutProductId.length > 0) {
				const errorResponse = buildErrorResponse(
					"All items must have a productId for 'without_request' type",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}
		}

		const productIds = validation.data.items
			.map((item) => item.productId)
			.filter((id): id is string => id !== undefined);

		const existingProducts = await prisma.product.findMany({
			where: {
				id: { in: productIds },
			},
			select: { id: true },
		});

		const existingProductIds = new Set(existingProducts.map((p) => p.id));
		const missingProductIds = productIds.filter((id) => !existingProductIds.has(id));

		if (missingProductIds.length > 0) {
			const errorResponse = buildErrorResponse(
				`Products not found: ${missingProductIds.join(", ")}`,
				404,
			);
			res.status(404).json(errorResponse);
			return;
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: req.userId, orgId: req.orgId },
				select: {
					id: true,
					role: true,
					subRole: true,
					orgId: true,
					department: {
						select: {
							id: true,
							name: true,
							code: true,
						},
					},
				},
			});

			if (!user?.department?.id) {
				const errorResponse = buildErrorResponse("Department in User not found!", 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (
				user?.department.code !== "PPPMG" &&
				user?.role !== "admin" &&
				user?.subRole !== "super" &&
				validation.data.sourceType === "department" &&
				validation.data.sourceId === validation.data.destinationId
			) {
				const errorResponse = buildErrorResponse(
					`Source and destination cannot be the same for department: ${validation.data.sourceId}`,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			let source = null;
			if (validation.data.sourceType === "department") {
				source = await prisma.department.findUnique({
					where: { id: validation.data.sourceId },
				});
			}

			if (validation.data.sourceType === "supplier") {
				source = await prisma.supplier.findUnique({
					where: { id: validation.data.sourceId },
				});
			}

			if (!source) {
				const errorResponse = buildErrorResponse(
					`Source not found for ID: ${validation.data.sourceType}`,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const deliveryOrder =
				validation.data.type === "with_request"
					? await createWithRequest(validation.data, user, req, res)
					: await createWithoutRequest(validation.data, user, req, res);

			if (!deliveryOrder) {
				const errorResponse = buildErrorResponse("User data is invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}
			if (res.headersSent || !deliveryOrder) {
				return;
			}

			deliveryOrderLogger.info(`DeliveryOrder created successfully: ${deliveryOrder.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DELIVERYORDER.ACTIONS.CREATE_DELIVERYORDER,
				description: `${config.ACTIVITY_LOG.DELIVERYORDER.DESCRIPTIONS.DELIVERYORDER_CREATED}: ${deliveryOrder.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DELIVERYORDER.PAGES.DELIVERYORDER_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DELIVERYORDER,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DELIVERYORDER,
				entityId: deliveryOrder.id,
				changesBefore: null,
				changesAfter: {
					id: deliveryOrder.id,
					createdAt: deliveryOrder.createdAt,
					updatedAt: deliveryOrder.updatedAt,
				},
				description: `${config.AUDIT_LOG.DELIVERYORDER.DESCRIPTIONS.DELIVERYORDER_CREATED}: ${deliveryOrder.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:deliveryOrder:list:*");
				deliveryOrderLogger.info("DeliveryOrder list cache invalidated after creation");
			} catch (cacheError) {
				deliveryOrderLogger.warn(
					"Failed to invalidate cache after deliveryOrder creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDER.CREATED_SUCCESSFUL,
				deliveryOrder,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deliveryOrderLogger);

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

		deliveryOrderLogger.info(
			`Getting deliveryOrders, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DeliveryOrderWhereInput = {
				isDeleted: false,
				...(req.orgId && { orgId: req.orgId }),
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"DeliveryOrder",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DeliveryOrder", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);
			if (fields) {
				if (!findManyQuery.select) {
					findManyQuery.select = {};
				}
				findManyQuery.select.sourceId = true;
				findManyQuery.select.sourceType = true;
			}
			const [deliveryOrders, total] = await Promise.all([
				document ? prisma.deliveryOrder.findMany(findManyQuery) : [],
				count ? prisma.deliveryOrder.count({ where: whereClause }) : 0,
			]);

			deliveryOrderLogger.info(`Retrieved ${deliveryOrders.length} deliveryOrders`);

			let enrichedDeliveryOrders: any[] = deliveryOrders;

			if (document && deliveryOrders.length > 0) {
				const departmentIds = deliveryOrders
					.filter((o) => o.sourceType === "department" && o.sourceId)
					.map((o) => o.sourceId!);
				const supplierIds = deliveryOrders
					.filter((o) => o.sourceType === "supplier" && o.sourceId)
					.map((o) => o.sourceId!);

				const [departments, suppliers] = await Promise.all([
					departmentIds.length > 0
						? prisma.department.findMany({ where: { id: { in: departmentIds } } })
						: [],
					supplierIds.length > 0
						? prisma.supplier.findMany({ where: { id: { in: supplierIds } } })
						: [],
				]);

				const departmentMap = new Map(departments.map((d) => [d.id, d]));
				const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

				enrichedDeliveryOrders = deliveryOrders.map((order) => {
					let source = null;
					if (order.sourceType === "department") {
						source = departmentMap.get(order.sourceId!) || null;
					} else if (order.sourceType === "supplier") {
						source = supplierMap.get(order.sourceId!) || null;
					}
					return { ...order, source };
				});
			}

			const processedData =
				groupBy && document
					? groupDataByField(enrichedDeliveryOrders, groupBy as string)
					: enrichedDeliveryOrders;

			const responseData: Record<string, any> = {
				...(document && { deliveryOrders: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DELIVERYORDER.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { identifier } = req.params;
		const { fields } = req.query;

		try {
			if (!identifier) {
				deliveryOrderLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deliveryOrderLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Check if it's a MongoDB ObjectId (24 hex characters)
			const isMongoId = ObjectId.isValid(identifier) && /^[0-9a-fA-F]{24}$/.test(identifier);
			const identifierType = isMongoId ? "id" : "orderNumber";

			deliveryOrderLogger.info(`Getting DeliveryOrder by ${identifierType}: ${identifier}`);

			const cacheKey = `cache:deliveryOrder:${identifierType}:${identifier}:${fields || "full"}`;
			let deliveryOrder = null;
			let deliverySource = null;

			try {
				if (redisClient.isClientConnected()) {
					deliveryOrder = await redisClient.getJSON(cacheKey);
					if (deliveryOrder) {
						deliveryOrderLogger.info(
							`DeliveryOrder ${identifier} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				deliveryOrderLogger.warn(
					`Redis cache retrieval failed for deliveryOrder ${identifier}:`,
					cacheError,
				);
			}

			if (!deliveryOrder) {
				const query: Prisma.DeliveryOrderFindFirstArgs = {
					where: isMongoId ? { id: identifier } : { orderNumber: identifier },
				};

				if (fields) {
					query.select = getNestedFields(fields);
					if (query.select) {
						query.select.sourceType = true;
						query.select.sourceId = true;
					}
				}

				deliveryOrder = await prisma.deliveryOrder.findFirst(query);

				if (deliveryOrder) {
					if (deliveryOrder.sourceType === "department") {
						deliverySource = await prisma.department.findFirst({
							where: { id: deliveryOrder.sourceId },
						});
					} else if (deliveryOrder.sourceType === "supplier") {
						deliverySource = await prisma.supplier.findFirst({
							where: { id: deliveryOrder.sourceId },
						});
					}
				}

				if (deliveryOrder && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, deliveryOrder, 3600);
						deliveryOrderLogger.info(
							`DeliveryOrder ${identifier} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						deliveryOrderLogger.warn(
							`Failed to store deliveryOrder ${identifier} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!deliveryOrder) {
				deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.NOT_FOUND}: ${identifier}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERYORDER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			deliveryOrderLogger.info(
				`${config.SUCCESS.DELIVERYORDER.RETRIEVED}: ${(deliveryOrder as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDER.RETRIEVED,
				{ ...deliveryOrder, source: deliverySource },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.ERROR_GETTING}: ${error}`);
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
				deliveryOrderLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeliveryOrderSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deliveryOrderLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deliveryOrderLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deliveryOrderLogger.info(`Updating deliveryOrder: ${id}`);

			const existingDeliveryOrder = await prisma.deliveryOrder.findFirst({
				where: { id },
			});

			if (!existingDeliveryOrder) {
				deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERYORDER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const { items, ...otherFields } = validatedData;

			const updatedDeliveryOrder = await prisma.deliveryOrder.update({
				where: { id },
				data: {
					...otherFields,
					...(items && {
						items: {
							deleteMany: {},
							create: items,
						},
					}),
				},
				include: {
					items: true,
				},
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryOrder:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryOrder:list:*");
				deliveryOrderLogger.info(`Cache invalidated after deliveryOrder ${id} update`);
			} catch (cacheError) {
				deliveryOrderLogger.warn(
					"Failed to invalidate cache after deliveryOrder update:",
					cacheError,
				);
			}

			deliveryOrderLogger.info(
				`${config.SUCCESS.DELIVERYORDER.UPDATED}: ${updatedDeliveryOrder.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDER.UPDATED,
				{ deliveryOrder: updatedDeliveryOrder },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.ERROR_UPDATING}: ${error}`);
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
				deliveryOrderLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deliveryOrderLogger.info(`${config.SUCCESS.DELIVERYORDER.DELETED}: ${id}`);

			const existingDeliveryOrder = await prisma.deliveryOrder.findFirst({
				where: { id },
			});

			if (!existingDeliveryOrder) {
				deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DELIVERYORDER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.deliveryOrder.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:deliveryOrder:byId:${id}:*`);
				await invalidateCache.byPattern("cache:deliveryOrder:list:*");
				deliveryOrderLogger.info(`Cache invalidated after deliveryOrder ${id} deletion`);
			} catch (cacheError) {
				deliveryOrderLogger.warn(
					"Failed to invalidate cache after deliveryOrder deletion:",
					cacheError,
				);
			}

			deliveryOrderLogger.info(`${config.SUCCESS.DELIVERYORDER.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DELIVERYORDER.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deliveryOrderLogger.error(`${config.ERROR.DELIVERYORDER.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
