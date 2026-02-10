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
import { CreateProductSchema, UpdateProductSchema } from "../../zod/product.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { logNotification, logNotificationForDepartments } from "../../utils/notificationLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";
import { generateGTIN13 } from "../../helper/generateGTIN";
import { convertSkuToAsciiDigits } from "../../helper/converToASCII";
import { roles } from "../../config/constant";
import { getUsersByRoleAndDepartment } from "../../helper/roleHelper";

const logger = getLogger();
const productLogger = logger.child({ module: "product" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			productLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			productLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateProductSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			productLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			let product;
			if (validation.data.sku) {
				const convertASCII = convertSkuToAsciiDigits(validation.data.sku);
				const GTIN = generateGTIN13("1021", convertASCII);
				product = await prisma.product.create({
					data: {
						...validation.data,
						gtin: GTIN,
					},
				});
			}

			if (!product) {
				res.status(400).json({ message: "Valid Request" });
				return;
			}

			productLogger.info(`Product created successfully: ${product.id}`);

			logActivity(req, {
				userId: (req as any).userId || "unknown",
				action: config.ACTIVITY_LOG.PRODUCT.ACTIONS.CREATE_PRODUCT,
				description: `${config.ACTIVITY_LOG.PRODUCT.DESCRIPTIONS.PRODUCT_CREATED}: ${product.name || product.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCT.PAGES.PRODUCT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCT,
				entityId: product.id,
				changesBefore: null,
				changesAfter: {
					...product,
				},
				description: `${config.AUDIT_LOG.PRODUCT.DESCRIPTIONS.PRODUCT_CREATED}: ${product.name || product.id}`,
			});

			// Create ONE notification for ALL users in department (recommended to avoid duplicates)
			const departmentId = (req as any).departmentId;
			if (departmentId && departmentId.length === 24) {
				const allRoles: roles[] = ["admin", "user", "viewer"];
				const allRecipients: Array<{ user: string; date: Date }> = [];

				// Collect all users from all roles in this department using helper
				for (const role of allRoles) {
					const users = await getUsersByRoleAndDepartment(role, departmentId);
					users.forEach((user) => {
						// Avoid duplicates (in case same user has multiple roles somehow)
						if (!allRecipients.find((r) => r.user === user.id)) {
							allRecipients.push({ user: user.id, date: new Date() });
						}
					});
				}

				if (allRecipients.length > 0) {
					await prisma.notification.create({
						data: {
							source: (req as any).userId || "unknown",
							category: "product_management",
							title: "New Product Created",
							description: `A new product "${product.name}" has been created.`,
							departmentId,
							recipients: {
								read: [],
								unread: allRecipients,
							},
							metadata: {
								productId: product.id,
								productName: product.name,
								createdBy: (req as any).userId || "unknown",
								timestamp: new Date().toISOString(),
							},
						},
					});
					productLogger.info(
						`Notification created for ${allRecipients.length} users in department`,
					);
				}
			}

			try {
				await invalidateCache.byPattern("cache:product:list:*");
				productLogger.info("Product list cache invalidated after creation");
			} catch (cacheError) {
				productLogger.warn(
					"Failed to invalidate cache after product creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCT.CREATED,
				product,
				201,
			);

			res.status(201).json(successResponse);
		} catch (error) {
			productLogger.error(`${config.ERROR.PRODUCT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, productLogger);

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

		productLogger.info(
			`Getting products, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ProductWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = [
				"name",
				"description",
				"sku",
				"category.name",
				"productType.name",
			];
			if (query) {
				const searchConditions = buildSearchConditions("Product", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Product", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [products, total] = await Promise.all([
				document ? prisma.product.findMany(findManyQuery) : [],
				count ? prisma.product.count({ where: whereClause }) : 0,
			]);

			productLogger.info(`Retrieved ${products.length} products`);
			const processedData =
				groupBy && document ? groupDataByField(products, groupBy as string) : products;

			const responseData: Record<string, any> = {
				...(document && { products: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.PRODUCT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			productLogger.error(`${config.ERROR.PRODUCT.GET_ALL_FAILED}: ${error}`);
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
				productLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				productLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			productLogger.info(`${config.SUCCESS.PRODUCT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:product:byId:${id}:${fields || "full"}`;
			let product = null;

			try {
				if (redisClient.isClientConnected()) {
					product = await redisClient.getJSON(cacheKey);
					if (product) {
						productLogger.info(`Product ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				productLogger.warn(`Redis cache retrieval failed for product ${id}:`, cacheError);
			}

			if (!product) {
				const query: Prisma.ProductFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				product = await prisma.product.findFirst(query);

				if (product && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, product, 3600);
						productLogger.info(`Product ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						productLogger.warn(
							`Failed to store product ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!product) {
				productLogger.error(`${config.ERROR.PRODUCT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			productLogger.info(`${config.SUCCESS.PRODUCT.RETRIEVED}: ${(product as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCT.RETRIEVED,
				product,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productLogger.error(`${config.ERROR.PRODUCT.ERROR_GETTING}: ${error}`);
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
				productLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateProductSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				productLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				productLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			productLogger.info(`Updating product: ${id}`);

			const existingProduct = await prisma.product.findFirst({
				where: { id },
			});

			if (!existingProduct) {
				productLogger.error(`${config.ERROR.PRODUCT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedProduct = await prisma.product.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:product:byId:${id}:*`);
				await invalidateCache.byPattern("cache:product:list:*");
				productLogger.info(`Cache invalidated after product ${id} update`);
			} catch (cacheError) {
				productLogger.warn("Failed to invalidate cache after product update:", cacheError);
			}

			logActivity(req, {
				userId: (req as any).userId || "unknown",
				action: config.ACTIVITY_LOG.PRODUCT.ACTIONS.UPDATE_PRODUCT,
				description: `${config.ACTIVITY_LOG.PRODUCT.DESCRIPTIONS.PRODUCT_UPDATED}: ${updatedProduct.name || updatedProduct.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCT.PAGES.PRODUCT_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCT,
				entityId: updatedProduct.id,
				changesBefore: existingProduct,
				changesAfter: updatedProduct,
				description: `${config.AUDIT_LOG.PRODUCT.DESCRIPTIONS.PRODUCT_UPDATED}: ${updatedProduct.name || updatedProduct.id}`,
			});

			const notifications = [
				{
					role: "admin",
					title: "Product Updated",
					description: `Product "${updatedProduct.name}" has been updated and requires admin review.`,
					category: "product_management",
				},
				{
					role: "user",
					title: "Product Information Updated",
					description: `Product "${updatedProduct.name}" information has been updated.`,
					category: "product_update",
				},
			];

			for (const notification of notifications) {
				logNotification(req, {
					role: notification.role,
					source: (req as any).userId || "unknown",
					category: notification.category,
					title: notification.title,
					description: notification.description,
					departmentId: (req as any).departmentId || "unknown",
					metadata: {
						productId: updatedProduct.id,
						productName: updatedProduct.name,
						updatedBy: (req as any).userId || "unknown",
						timestamp: new Date().toISOString(),
						changes: validatedData,
					},
				});
			}

			productLogger.info(`${config.SUCCESS.PRODUCT.UPDATED}: ${updatedProduct.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.PRODUCT.UPDATED,
				{ product: updatedProduct },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			productLogger.error(`${config.ERROR.PRODUCT.ERROR_UPDATING}: ${error}`);
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
				productLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			productLogger.info(`${config.SUCCESS.PRODUCT.DELETED}: ${id}`);

			const existingProduct = await prisma.product.findFirst({
				where: { id },
			});

			if (!existingProduct) {
				productLogger.error(`${config.ERROR.PRODUCT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.PRODUCT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.product.delete({
				where: { id },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.PRODUCT.ACTIONS.DELETE_PRODUCT,
				description: `${config.ACTIVITY_LOG.PRODUCT.DESCRIPTIONS.PRODUCT_DELETED}: ${existingProduct.name || existingProduct.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.PRODUCT.PAGES.PRODUCT_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.PRODUCT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.PRODUCT,
				entityId: existingProduct.id,
				changesBefore: existingProduct,
				changesAfter: null,
				description: `${config.AUDIT_LOG.PRODUCT.DESCRIPTIONS.PRODUCT_DELETED}: ${existingProduct.name || existingProduct.id}`,
			});

			const notifications = [
				{
					role: "admin",
					title: "Product Deleted",
					description: `Product "${existingProduct.name}" has been deleted from the system.`,
					category: "product_management",
				},
				{
					role: "user",
					title: "Product No Longer Available",
					description: `Product "${existingProduct.name}" is no longer available in the inventory.`,
					category: "product_update",
				},
			];

			for (const notification of notifications) {
				logNotification(req, {
					role: notification.role,
					source: (req as any).userId || "unknown",
					category: notification.category,
					title: notification.title,
					description: notification.description,
					departmentId: (req as any).departmentId || "unknown",
					metadata: {
						productId: existingProduct.id,
						productName: existingProduct.name,
						deletedBy: (req as any).user?.id || "unknown",
						timestamp: new Date().toISOString(),
						deletedProduct: existingProduct,
					},
				});
			}

			try {
				await invalidateCache.byPattern(`cache:product:byId:${id}:*`);
				await invalidateCache.byPattern("cache:product:list:*");
				productLogger.info(`Cache invalidated after product ${id} deletion`);
			} catch (cacheError) {
				productLogger.warn(
					"Failed to invalidate cache after product deletion:",
					cacheError,
				);
			}

			productLogger.info(`${config.SUCCESS.PRODUCT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.PRODUCT.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			productLogger.error(`${config.ERROR.PRODUCT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
