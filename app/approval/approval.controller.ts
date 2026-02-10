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
import { CreateApprovalSchema, UpdateApprovalSchema } from "../../zod/approval.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";

const logger = getLogger();
const approvalLogger = logger.child({ module: "approval" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			approvalLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			approvalLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateApprovalSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			approvalLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Extract approvers from validated data
			const { approvers, ...approvalData } = validation.data;

			// Create approval with multiple approvers through UserApproval join table
			const approval = await prisma.approval.create({
				data: {
					...approvalData,
					userApprovals: {
						create: approvers.map((approver) => ({
							userId: approver.userId,
							role: approver.role,
							order: approver.order,
						})),
					},
				},
				include: {
					userApprovals: {
						include: {
							user: {
								select: {
									id: true,
									userName: true,
									email: true,
									role: true,
								},
							},
						},
					},
				},
			});

			approvalLogger.info(
				`Approval created successfully: ${approval.id} with ${approvers.length} approvers`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPROVAL.ACTIONS.CREATE_APPROVAL,
				description: `${config.ACTIVITY_LOG.APPROVAL.DESCRIPTIONS.APPROVAL_CREATED}: ${approval.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPROVAL.PAGES.APPROVAL_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.APPROVAL,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.APPROVAL,
				entityId: approval.id,
				changesBefore: null,
				changesAfter: {
					id: approval.id,
					createdAt: approval.createdAt,
					updatedAt: approval.updatedAt,
				},
				description: `${config.AUDIT_LOG.APPROVAL.DESCRIPTIONS.APPROVAL_CREATED}: ${approval.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:approval:list:*");
				approvalLogger.info("Approval list cache invalidated after creation");
			} catch (cacheError) {
				approvalLogger.warn(
					"Failed to invalidate cache after approval creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.APPROVAL.CREATED,
				approval,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			approvalLogger.error(`${config.ERROR.APPROVAL.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, approvalLogger);

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

		approvalLogger.info(
			`Getting approvals, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ApprovalWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Approval", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Approval", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [approvals, total] = await Promise.all([
				document ? prisma.approval.findMany(findManyQuery) : [],
				count ? prisma.approval.count({ where: whereClause }) : 0,
			]);

			approvalLogger.info(`Retrieved ${approvals.length} approvals`);
			const processedData =
				groupBy && document ? groupDataByField(approvals, groupBy as string) : approvals;

			const responseData: Record<string, any> = {
				...(document && { approvals: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.APPROVAL.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			approvalLogger.error(`${config.ERROR.APPROVAL.GET_ALL_FAILED}: ${error}`);
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
				approvalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				approvalLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			approvalLogger.info(`${config.SUCCESS.APPROVAL.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:approval:byId:${id}:${fields || "full"}`;
			let approval = null;

			try {
				if (redisClient.isClientConnected()) {
					approval = await redisClient.getJSON(cacheKey);
					if (approval) {
						approvalLogger.info(`Approval ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				approvalLogger.warn(`Redis cache retrieval failed for approval ${id}:`, cacheError);
			}

			if (!approval) {
				const query: Prisma.ApprovalFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				approval = await prisma.approval.findFirst(query);

				if (approval && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, approval, 3600);
						approvalLogger.info(`Approval ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						approvalLogger.warn(
							`Failed to store approval ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!approval) {
				approvalLogger.error(`${config.ERROR.APPROVAL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.APPROVAL.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			approvalLogger.info(`${config.SUCCESS.APPROVAL.RETRIEVED}: ${(approval as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.APPROVAL.RETRIEVED,
				approval,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalLogger.error(`${config.ERROR.APPROVAL.ERROR_GETTING}: ${error}`);
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
				approvalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateApprovalSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				approvalLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				approvalLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			approvalLogger.info(`Updating approval: ${id}`);

			const existingApproval = await prisma.approval.findFirst({
				where: { id },
			});

			if (!existingApproval) {
				approvalLogger.error(`${config.ERROR.APPROVAL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.APPROVAL.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Extract approvers from validated data
			const { approvers, ...approvalData } = validatedData;

			// Build update data
			const updateData: any = { ...approvalData };

			// If approvers are provided, replace all existing approvers
			if (approvers && approvers.length > 0) {
				updateData.userApprovals = {
					deleteMany: {}, // Delete all existing approvers
					create: approvers.map((approver) => ({
						userId: approver.userId,
						role: approver.role,
						order: approver.order,
					})),
				};
			}

			const updatedApproval = await prisma.approval.update({
				where: { id },
				data: updateData,
				include: {
					userApprovals: {
						include: {
							user: {
								select: {
									id: true,
									userName: true,
									email: true,
									role: true,
								},
							},
						},
					},
				},
			});

			try {
				await invalidateCache.byPattern(`cache:approval:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approval:list:*");
				approvalLogger.info(`Cache invalidated after approval ${id} update`);
			} catch (cacheError) {
				approvalLogger.warn(
					"Failed to invalidate cache after approval update:",
					cacheError,
				);
			}

			approvalLogger.info(`${config.SUCCESS.APPROVAL.UPDATED}: ${updatedApproval.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.APPROVAL.UPDATED,
				{ approval: updatedApproval },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalLogger.error(`${config.ERROR.APPROVAL.ERROR_UPDATING}: ${error}`);
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
				approvalLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			approvalLogger.info(`${config.SUCCESS.APPROVAL.DELETED}: ${id}`);

			const existingApproval = await prisma.approval.findFirst({
				where: { id },
			});

			if (!existingApproval) {
				approvalLogger.error(`${config.ERROR.APPROVAL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.APPROVAL.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.approval.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:approval:byId:${id}:*`);
				await invalidateCache.byPattern("cache:approval:list:*");
				approvalLogger.info(`Cache invalidated after approval ${id} deletion`);
			} catch (cacheError) {
				approvalLogger.warn(
					"Failed to invalidate cache after approval deletion:",
					cacheError,
				);
			}

			approvalLogger.info(`${config.SUCCESS.APPROVAL.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.APPROVAL.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			approvalLogger.error(`${config.ERROR.APPROVAL.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
