import { Router, Request, Response, NextFunction } from "express";
import { cache, cacheShort, cacheMedium, cacheUser } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/auditLog";

	/**
	 * @openapi
	 * /api/auditLog/{id}:
	 *   get:
	 *     summary: Get auditLog by ID
	 *     description: Retrieve a specific auditLog by its unique identifier with optional field selection
	 *     tags: [AuditLog]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AuditLog ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description,type"
	 *     responses:
	 *       200:
	 *         description: AuditLog retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         auditLog:
	 *                           $ref: '#/components/schemas/AuditLog'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual auditLog with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:auditLog:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/auditLog:
	 *   get:
	 *     summary: Get all auditLogs
	 *     description: Retrieve auditLogs with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [AuditLog]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *         example: 1
	 *       - in: query
	 *         name: limit
	 *         required: false
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of records per page
	 *         example: 10
	 *       - in: query
	 *         name: order
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *           default: desc
	 *         description: Sort order for results
	 *         example: desc
	 *       - in: query
	 *         name: sort
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *         example: "createdAt"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports dot notation)
	 *         example: "id,name,description,type"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by name or description
	 *         example: "welcome email"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"type":"email"},{"isDeleted":false}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "type"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include auditLog documents in response
	 *       - in: query
	 *         name: pagination
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include pagination metadata in response
	 *       - in: query
	 *         name: count
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include total count in response
	 *     responses:
	 *       200:
	 *         description: Templates retrieved successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         auditLogs:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/AuditLog'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/AuditLog'
	 *                           description: Present when groupBy is used and document="true"
	 *                         count:
	 *                           type: integer
	 *                           description: Present when count="true"
	 *                         pagination:
	 *                           $ref: '#/components/schemas/Pagination'
	 *                           description: Present when pagination="true"
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache auditLog list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:auditLog:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/auditLog:
	 *   post:
	 *     summary: Create new auditLog
	 *     description: Create a new auditLog with the provided data
	 *     tags: [AuditLog]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: AuditLog name
	 *                 example: "Email Welcome AuditLog"
	 *               description:
	 *                 type: string
	 *                 description: AuditLog description
	 *                 example: "Welcome email auditLog for new users"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: AuditLog type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 default: false
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               type:
	 *                 type: string
	 *               isDeleted:
	 *                 type: boolean
	 *     responses:
	 *       201:
	 *         description: AuditLog created successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         auditLog:
	 *                           $ref: '#/components/schemas/AuditLog'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/auditLog/{id}:
	 *   patch:
	 *     summary: Update auditLog
	 *     description: Update auditLog data by ID (partial update)
	 *     tags: [AuditLog]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AuditLog ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: AuditLog name
	 *                 example: "Updated Email AuditLog"
	 *               description:
	 *                 type: string
	 *                 description: AuditLog description
	 *                 example: "Updated description for the auditLog"
	 *               type:
	 *                 type: string
	 *                 enum: ["email", "sms", "push", "form"]
	 *                 description: AuditLog type for categorization
	 *                 example: "email"
	 *               isDeleted:
	 *                 type: boolean
	 *                 description: Soft delete flag
	 *                 example: false
	 *     responses:
	 *       200:
	 *         description: AuditLog updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       properties:
	 *                         auditLog:
	 *                           $ref: '#/components/schemas/AuditLog'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/auditLog/{id}:
	 *   delete:
	 *     summary: Delete auditLog
	 *     description: Permanently delete a auditLog by ID
	 *     tags: [AuditLog]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: AuditLog ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: AuditLog deleted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               allOf:
	 *                 - $ref: '#/components/schemas/Success'
	 *                 - type: object
	 *                   properties:
	 *                     data:
	 *                       type: object
	 *                       description: Empty object for successful deletion
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
