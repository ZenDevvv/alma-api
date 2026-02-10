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
import { CreateSupplierSchema, UpdateSupplierSchema } from "../../zod/supplier.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";

const logger = getLogger();
const supplierLogger = logger.child({ module: "supplier" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			supplierLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			supplierLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateSupplierSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			supplierLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const supplier = await prisma.supplier.create({
				data: {
					...validation.data,
					orgId: req.orgId!,
				},
			});
			supplierLogger.info(`Supplier created successfully: ${supplier.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SUPPLIER.ACTIONS.CREATE_SUPPLIER,
				description: `${config.ACTIVITY_LOG.SUPPLIER.DESCRIPTIONS.SUPPLIER_CREATED}: ${supplier.name || supplier.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SUPPLIER.PAGES.SUPPLIER_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SUPPLIER,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SUPPLIER,
				entityId: supplier.id,
				changesBefore: null,
				changesAfter: {
					id: supplier.id,
					name: supplier.name,

					createdAt: supplier.createdAt,
					updatedAt: supplier.updatedAt,
				},
				description: `${config.AUDIT_LOG.SUPPLIER.DESCRIPTIONS.SUPPLIER_CREATED}: ${supplier.name || supplier.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:supplier:list:*");
				supplierLogger.info("Supplier list cache invalidated after creation");
			} catch (cacheError) {
				supplierLogger.warn(
					"Failed to invalidate cache after supplier creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIER.CREATED,
				supplier,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, supplierLogger);

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

		supplierLogger.info(
			`Getting suppliers, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.SupplierWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["code", "name", "contactPerson", "email"];

			if (query) {
				const searchConditions = buildSearchConditions("Supplier", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Supplier", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [suppliers, total] = await Promise.all([
				document ? prisma.supplier.findMany(findManyQuery) : [],
				count ? prisma.supplier.count({ where: whereClause }) : 0,
			]);

			supplierLogger.info(`Retrieved ${suppliers.length} suppliers`);
			const processedData =
				groupBy && document ? groupDataByField(suppliers, groupBy as string) : suppliers;

			const responseData: Record<string, any> = {
				...(document && { suppliers: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SUPPLIER.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				supplierLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				supplierLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			supplierLogger.info(`${config.SUCCESS.SUPPLIER.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:supplier:byId:${id}:${fields || "full"}`;
			let supplier = null;

			try {
				if (redisClient.isClientConnected()) {
					supplier = await redisClient.getJSON(cacheKey);
					if (supplier) {
						supplierLogger.info(`Supplier ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				supplierLogger.warn(`Redis cache retrieval failed for supplier ${id}:`, cacheError);
			}

			if (!supplier) {
				const query: Prisma.SupplierFindFirstArgs = {
					where: {
						id,
						// Superadmin sees all, others see only their org
						...(req.orgId && { orgId: req.orgId }),
					},
				};

				query.select = getNestedFields(fields);

				supplier = await prisma.supplier.findFirst(query);

				if (supplier && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, supplier, 3600);
						supplierLogger.info(`Supplier ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						supplierLogger.warn(
							`Failed to store supplier ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!supplier) {
				supplierLogger.error(`${config.ERROR.SUPPLIER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SUPPLIER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			supplierLogger.info(`${config.SUCCESS.SUPPLIER.RETRIEVED}: ${(supplier as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIER.RETRIEVED,
				supplier,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				supplierLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSupplierSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				supplierLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				supplierLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			supplierLogger.info(`Updating supplier: ${id}`);

			const existingSupplier = await prisma.supplier.findFirst({
				where: {
					id,
					// Superadmin can update all, others only their org
					...(req.orgId && { orgId: req.orgId }),
				},
			});

			if (!existingSupplier) {
				supplierLogger.error(`${config.ERROR.SUPPLIER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SUPPLIER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedSupplier = await prisma.supplier.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:supplier:byId:${id}:*`);
				await invalidateCache.byPattern("cache:supplier:list:*");
				supplierLogger.info(`Cache invalidated after supplier ${id} update`);
			} catch (cacheError) {
				supplierLogger.warn(
					"Failed to invalidate cache after supplier update:",
					cacheError,
				);
			}

			supplierLogger.info(`${config.SUCCESS.SUPPLIER.UPDATED}: ${updatedSupplier.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SUPPLIER.UPDATED,
				{ supplier: updatedSupplier },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				supplierLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			supplierLogger.info(`${config.SUCCESS.SUPPLIER.DELETED}: ${id}`);

			const existingSupplier = await prisma.supplier.findFirst({
				where: {
					id,
					// Superadmin can delete all, others only their org
					...(req.orgId && { orgId: req.orgId }),
				},
			});

			if (!existingSupplier) {
				supplierLogger.error(`${config.ERROR.SUPPLIER.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SUPPLIER.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.supplier.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:supplier:byId:${id}:*`);
				await invalidateCache.byPattern("cache:supplier:list:*");
				supplierLogger.info(`Cache invalidated after supplier ${id} deletion`);
			} catch (cacheError) {
				supplierLogger.warn(
					"Failed to invalidate cache after supplier deletion:",
					cacheError,
				);
			}

			supplierLogger.info(`${config.SUCCESS.SUPPLIER.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SUPPLIER.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			supplierLogger.error(`${config.ERROR.SUPPLIER.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
