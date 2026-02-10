import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma, StockStatus } from "../../generated/prisma";
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
import { buildErrorResponse, ErrorDetail, formatZodErrors } from "../../helper/error-handler";
import {
	AdjustStockQuantitySchema,
	CreateStockRecordSchema,
	UpdateStockRecordSchema,
} from "../../zod/stock-record.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { logNotification } from "../../utils/notificationLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { getUsersByRoleAndDepartment } from "../../helper/roleHelper";
import { roles } from "../../config/constant";
import { performStockAdjustment } from "../../helper/perform-stock-adjustment";

const logger = getLogger();
const stockRecordLogger = logger.child({ module: "stockRecord" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			stockRecordLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			stockRecordLogger.info("Transformed form data:", JSON.stringify(requestData, null, 2));
		}

		// Zod validation
		const validation = CreateStockRecordSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			stockRecordLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		const { departmentId, productId, totalStock, status } = validation.data;

		try {
			// 1. Validate Department exists
			const department = await prisma.department.findUnique({
				where: { id: departmentId },
				select: { id: true, name: true },
			});

			if (!department) {
				res.status(404).json(
					buildErrorResponse("Department not found", 404, [
						{
							field: "departmentId",
							message: "The specified department does not exist",
						},
					]),
				);
				return;
			}

			// 2. Validate Product exists
			const product = await prisma.product.findUnique({
				where: { id: productId },
				select: { id: true, name: true },
			});

			if (!product) {
				res.status(404).json(
					buildErrorResponse("Product not found", 404, [
						{ field: "productId", message: "The specified product does not exist" },
					]),
				);
				return;
			}

			// 3. Create StockRecord
			const stockRecord = await prisma.stockRecord.create({
				data: {
					departmentId,
					productId,
					totalStock,
					status,
				},
				include: {
					product: { select: { name: true } },
					department: { select: { name: true } },
				},
			});

			stockRecordLogger.info(`StockRecord created: ${stockRecord.id}`);

			// Activity Log
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.STOCKRECORD.ACTIONS.CREATE_STOCKRECORD,
				description: `${config.ACTIVITY_LOG.STOCKRECORD.DESCRIPTIONS.STOCKRECORD_CREATED} - Product: ${product.name} in ${department.name} (Quantity: ${totalStock})`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.STOCKRECORD.PAGES.STOCKRECORD_CREATION,
				},
			});

			// Audit Log
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.STOCKRECORD,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.STOCKRECORD,
				entityId: stockRecord.id,
				changesBefore: null,
				changesAfter: stockRecord,
				description: `Stock record created for product "${product.name}" in department "${department.name}" with ${totalStock} units`,
			});

			// Notification to department users
			const allRoles: roles[] = ["admin", "user", "viewer"];
			const recipients: Array<{ user: string; date: Date }> = [];

			for (const role of allRoles) {
				const users = await getUsersByRoleAndDepartment(role, departmentId);
				users.forEach((user) => {
					if (!recipients.some((r) => r.user === user.id)) {
						recipients.push({ user: user.id, date: new Date() });
					}
				});
			}

			if (recipients.length > 0) {
				await prisma.notification.create({
					data: {
						source: (req as any).user?.id || "system",
						category: "inventory_management",
						title: "New Stock Record Added",
						description: `Product "${product.name}" is now tracked in ${department.name}. Quantity: ${totalStock}, Status: ${status.replace("_", " ").toUpperCase()}`,
						departmentId,
						recipients: { read: [], unread: recipients },
						metadata: {
							stockRecordId: stockRecord.id,
							productId,
							productName: product.name,
							departmentId,
							totalStock,
							status,
							createdBy: (req as any).user?.id || "unknown",
						},
					},
				});
			}

			// Cache invalidation
			try {
				await invalidateCache.byPattern("cache:stockRecord:list:*");
				await invalidateCache.byPattern(`cache:stockRecord:byId:${stockRecord.id}:*`);
			} catch (err) {
				stockRecordLogger.warn("Cache invalidation failed after create:", err);
			}

			res.status(201).json(
				buildSuccessResponse(config.SUCCESS.STOCKRECORD.CREATED, stockRecord, 201),
			);
		} catch (error: any) {
			// Handle unique constraint violation (one stock record per product + department)
			if (error.code === "P2002") {
				res.status(409).json(
					buildErrorResponse(
						"A stock record already exists for this product in the specified department",
						409,
					),
				);
			}

			stockRecordLogger.error("Create StockRecord failed:", error);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, stockRecordLogger);
		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}
		const {
			page = 1,
			limit = 10,
			order,
			fields,
			sort,
			skip,
			query,
			document = true,
			pagination = true,
			count = true,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		try {
			const whereClause: Prisma.StockRecordWhereInput = { isDeleted: false };

			const searchFields = ["name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("StockRecord", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filters = buildFilterConditions("StockRecord", filter);
				if (filters.length > 0) whereClause.AND = filters;
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [stockRecords, total] = await Promise.all([
				document ? prisma.stockRecord.findMany(findManyQuery) : [],
				count ? prisma.stockRecord.count({ where: whereClause }) : 0,
			]);

			const processedData = groupBy
				? groupDataByField(stockRecords, groupBy as string)
				: stockRecords;

			const responseData: Record<string, any> = {
				...(document && { stockRecords: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.STOCKRECORD.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			stockRecordLogger.error("getAll StockRecord failed:", error);
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
				stockRecordLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			if (fields && typeof fields !== "string") {
				stockRecordLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				res.status(400).json(
					buildErrorResponse(config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING, 400),
				);
				return;
			}

			stockRecordLogger.info(`${config.SUCCESS.STOCKRECORD.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:stockRecord:byId:${id}:${fields || "full"}`;
			let stockRecord: any = null;

			try {
				if (redisClient.isClientConnected()) {
					stockRecord = await redisClient.getJSON(cacheKey);
					if (stockRecord) stockRecordLogger.info(`StockRecord ${id} cache hit`);
				}
			} catch (err) {
				stockRecordLogger.warn("Redis get failed:", err);
			}

			if (!stockRecord) {
				stockRecord = await prisma.stockRecord.findFirst({
					where: { id },
					select: fields ? getNestedFields(fields as string) : undefined,
				});

				if (stockRecord && redisClient.isClientConnected()) {
					await redisClient.setJSON(cacheKey, stockRecord, 3600);
				}
			}

			if (!stockRecord) {
				stockRecordLogger.error(`${config.ERROR.STOCKRECORD.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.STOCKRECORD.NOT_FOUND, 404));
				return;
			}

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.STOCKRECORD.RETRIEVED, stockRecord, 200),
			);
		} catch (error) {
			stockRecordLogger.error("getById StockRecord error:", error);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id)
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			if (Object.keys(req.body).length === 0)
				res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));

			const validation = UpdateStockRecordSchema.safeParse(req.body);
			if (!validation.success) {
				const errors = formatZodErrors(validation.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, errors));
				return;
			}

			const existing = await prisma.stockRecord.findFirst({
				where: { id },
				include: { product: true, department: true },
			});

			if (!existing) {
				res.status(404).json(buildErrorResponse(config.ERROR.STOCKRECORD.NOT_FOUND, 404));
				return;
			}

			const updatedStockRecord = await prisma.stockRecord.update({
				where: { id },
				data: validation.data,
				include: {
					product: { select: { name: true } },
					department: { select: { name: true } },
				},
			});

			// Activity & Audit
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.STOCKRECORD.ACTIONS.UPDATE_STOCKRECORD,
				description: `${config.ACTIVITY_LOG.STOCKRECORD.DESCRIPTIONS.STOCKRECORD_UPDATED} - ${updatedStockRecord.product?.name} (${updatedStockRecord.status})`,
				page: { url: req.originalUrl, title: "Stock Record Update" },
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.STOCKRECORD,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.STOCKRECORD,
				entityId: updatedStockRecord.id,
				changesBefore: existing,
				changesAfter: updatedStockRecord,
				description: `Stock status updated to ${updatedStockRecord.status.replace("_", " ")} for ${updatedStockRecord.product?.name}`,
			});

			// Notifications based on status change
			if (validation.data.status) {
				const statusMessages: Record<string, { title: string; category: string }> = {
					low_stock: { title: "Low Stock Alert", category: "inventory_alert" },
					out_of_stock: { title: "Out of Stock", category: "critical_inventory" },
					expired: { title: "Product Expired", category: "critical_inventory" },
					near_expiry: { title: "Near Expiry Warning", category: "inventory_alert" },
					damaged: { title: "Damaged Stock Reported", category: "inventory_issue" },
					quarantined: { title: "Product Quarantined", category: "inventory_issue" },
				};

				const msg = statusMessages[validation.data.status];
				if (msg) {
					logNotification(req, {
						role: "admin",
						source: (req as any).user?.id || "system",
						category: msg.category,
						title: msg.title,
						description: `Product "${updatedStockRecord.product?.name}" is now ${validation.data.status.replace("_", " ")}`,
						departmentId: updatedStockRecord.departmentId,
						metadata: {
							stockRecordId: updatedStockRecord.id,
							productName: updatedStockRecord.product?.name,
							newStatus: validation.data.status,
						},
					});
				}
			}

			// Invalidate cache
			await invalidateCache.byPattern(`cache:stockRecord:byId:${id}:*`);
			await invalidateCache.byPattern("cache:stockRecord:list:*");

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.STOCKRECORD.UPDATED, updatedStockRecord, 200),
			);
		} catch (error: any) {
			if (error.code === "P2025") {
				res.status(404).json(buildErrorResponse(config.ERROR.STOCKRECORD.NOT_FOUND, 404));
			}
			stockRecordLogger.error("Update StockRecord failed:", error);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}
			const existing = await prisma.stockRecord.findFirst({
				where: { id },
				include: { product: true, department: true },
			});

			if (!existing) {
				res.status(404).json(buildErrorResponse(config.ERROR.STOCKRECORD.NOT_FOUND, 404));
				return;
			}

			await prisma.stockRecord.delete({ where: { id } });

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.STOCKRECORD.ACTIONS.DELETE_STOCKRECORD,
				description: `${config.ACTIVITY_LOG.STOCKRECORD.DESCRIPTIONS.STOCKRECORD_DELETED} - ${existing.product?.name}`,
				page: { url: req.originalUrl, title: "Stock Record Deletion" },
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.STOCKRECORD,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.STOCKRECORD,
				entityId: existing.id,
				changesBefore: existing,
				changesAfter: null,
				description: `Stock record deleted for product "${existing.product?.name}"`,
			});

			// Notify admins
			logNotification(req, {
				role: "admin",
				source: (req as any).user?.id || "system",
				category: "inventory_management",
				title: "Stock Record Removed",
				description: `Stock tracking removed for product "${existing.product?.name}" in ${existing.department?.name || "department"}`,
				departmentId: existing.departmentId,
				metadata: { stockRecordId: existing.id, productName: existing.product?.name },
			});

			await invalidateCache.byPattern(`cache:stockRecord:byId:${id}:*`);
			await invalidateCache.byPattern("cache:stockRecord:list:*");

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.STOCKRECORD.DELETED, { id }, 200),
			);
		} catch (error) {
			stockRecordLogger.error("Delete StockRecord failed:", error);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const adjustStockQuantity = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			requestData = transformFormDataToObject(req.body);
		}

		const validation = AdjustStockQuantitySchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			stockRecordLogger.error(
				`Stock adjustment validation failed: ${JSON.stringify(formattedErrors)}`,
			);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		const { departmentId, productId, quantity: positiveQuantity, operation } = validation.data;
		const quantity = operation === "out" ? -positiveQuantity : positiveQuantity;

		try {
			// Call the shared function (validation happens inside it)
			const result = await performStockAdjustment(prisma, requestData);

			const { stockRecord, wasCreated, adjustment } = result;

			// Cache invalidation
			await invalidateCache.byPattern("cache:stockRecord:list:*");
			await invalidateCache.byPattern(`cache:stockRecord:byId:${stockRecord.id}:*`);

			// Pure response — no logging, no notifications, no audit (as per original)
			res.status(wasCreated ? 201 : 200).json(
				buildSuccessResponse(
					wasCreated ? config.SUCCESS.STOCKRECORD.CREATED : "Stock adjusted successfully",
					{
						...stockRecord,
						adjustment,
					},
					wasCreated ? 201 : 200,
				),
			);
			return;
		} catch (error: any) {
			stockRecordLogger.error("Stock adjustment failed:", error);

			if (
				error.message?.includes("Insufficient stock") ||
				error.message?.includes("negative")
			) {
				res.status(400).json(buildErrorResponse(error.message, 400));
			}

			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove, adjustStockQuantity };
};
