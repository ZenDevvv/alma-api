import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	addPrerequisite(req: Request, res: Response, next: NextFunction): Promise<void>;
	removePrerequisite(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPrerequisites(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/course";

	/**
	 * @openapi
	 * /api/course/{id}:
	 *   get:
	 *     summary: Get course by ID
	 *     description: Retrieve a specific course by its unique identifier with optional field selection
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Course ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,title,code,description,status,level"
	 *     responses:
	 *       200:
	 *         description: Course retrieved successfully
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
	 *                         course:
	 *                           $ref: '#/components/schemas/Course'
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	// Cache individual course with predictable key for invalidation
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:course:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/course:
	 *   get:
	 *     summary: Get all courses
	 *     description: Retrieve courses with advanced filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [Course]
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
	 *         example: "id,title,code,status,level,creditHours"
	 *       - in: query
	 *         name: query
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Search query to filter by title, code, or description
	 *         example: "computer science"
	 *       - in: query
	 *         name: filter
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: JSON array of filter objects for advanced filtering
	 *         example: '[{"status":"active"},{"level":"beginner"}]'
	 *       - in: query
	 *         name: groupBy
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Group results by a field name
	 *         example: "status"
	 *       - in: query
	 *         name: document
	 *         required: false
	 *         schema:
	 *           type: string
	 *           enum: ["true"]
	 *         description: Include course documents in response
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
	 *         description: Courses retrieved successfully
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
	 *                         courses:
	 *                           type: array
	 *                           items:
	 *                             $ref: '#/components/schemas/Course'
	 *                           description: Present when document="true" and no groupBy
	 *                         groups:
	 *                           type: object
	 *                           additionalProperties:
	 *                             type: array
	 *                             items:
	 *                               $ref: '#/components/schemas/Course'
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
	// Cache course list with predictable key for invalidation
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:course:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/course:
	 *   post:
	 *     summary: Create new course
	 *     description: Create a new course with the provided data
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - title
	 *               - code
	 *               - orgId
	 *             properties:
	 *               title:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Course title
	 *                 example: "Introduction to Computer Science"
	 *               code:
	 *                 type: string
	 *                 minLength: 1
	 *                 description: Course code (unique per organization)
	 *                 example: "CS-101"
	 *               description:
	 *                 type: string
	 *                 description: Course description
	 *                 example: "Foundational concepts in computing"
	 *               status:
	 *                 type: string
	 *                 enum: [draft, pending_approval, active, archived]
	 *                 default: draft
	 *               level:
	 *                 type: string
	 *                 enum: [beginner, intermediate, advanced, all_levels]
	 *                 default: all_levels
	 *               creditHours:
	 *                 type: number
	 *                 description: Credit hours / units
	 *               orgId:
	 *                 type: string
	 *                 description: Organization ID
	 *               facultyId:
	 *                 type: string
	 *                 description: Faculty ID
	 *               programId:
	 *                 type: string
	 *                 description: Program ID
	 *               categoryId:
	 *                 type: string
	 *                 description: Category ID
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - title
	 *               - code
	 *               - orgId
	 *             properties:
	 *               title:
	 *                 type: string
	 *                 minLength: 1
	 *               code:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               status:
	 *                 type: string
	 *               level:
	 *                 type: string
	 *               creditHours:
	 *                 type: number
	 *               orgId:
	 *                 type: string
	 *         multipart/form-data:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - title
	 *               - code
	 *               - orgId
	 *             properties:
	 *               title:
	 *                 type: string
	 *                 minLength: 1
	 *               code:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               status:
	 *                 type: string
	 *               level:
	 *                 type: string
	 *               creditHours:
	 *                 type: number
	 *               orgId:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: Course created successfully
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
	 *                         course:
	 *                           $ref: '#/components/schemas/Course'
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
	 * /api/course/{id}:
	 *   patch:
	 *     summary: Update course
	 *     description: Update course data by ID (partial update)
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Course ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             minProperties: 1
	 *             properties:
	 *               title:
	 *                 type: string
	 *                 minLength: 1
	 *               code:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *               status:
	 *                 type: string
	 *                 enum: [draft, pending_approval, active, archived]
	 *               level:
	 *                 type: string
	 *                 enum: [beginner, intermediate, advanced, all_levels]
	 *               creditHours:
	 *                 type: number
	 *               version:
	 *                 type: integer
	 *     responses:
	 *       200:
	 *         description: Course updated successfully
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
	 *                         course:
	 *                           $ref: '#/components/schemas/Course'
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
	 * /api/course/{id}:
	 *   delete:
	 *     summary: Delete course
	 *     description: Permanently delete a course by ID
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Course ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *     responses:
	 *       200:
	 *         description: Course deleted successfully
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

	/**
	 * @openapi
	 * /api/course/{id}/prerequisite:
	 *   get:
	 *     summary: Get course prerequisites
	 *     description: Retrieve all prerequisites for a specific course
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Course ID (MongoDB ObjectId format)
	 *     responses:
	 *       200:
	 *         description: Prerequisites retrieved successfully
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 */
	routes.get("/:id/prerequisite", controller.getPrerequisites);

	/**
	 * @openapi
	 * /api/course/{id}/prerequisite:
	 *   post:
	 *     summary: Add a prerequisite to a course
	 *     description: Link an existing course as a prerequisite
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Course ID (MongoDB ObjectId format)
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - prerequisiteId
	 *             properties:
	 *               prerequisiteId:
	 *                 type: string
	 *                 description: The ID of the course to add as a prerequisite
	 *     responses:
	 *       201:
	 *         description: Prerequisite added successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 */
	routes.post("/:id/prerequisite", controller.addPrerequisite);

	/**
	 * @openapi
	 * /api/course/{id}/prerequisite/{prerequisiteId}:
	 *   delete:
	 *     summary: Remove a prerequisite from a course
	 *     description: Unlink a prerequisite course
	 *     tags: [Course]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Course ID
	 *       - in: path
	 *         name: prerequisiteId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: Prerequisite course ID to remove
	 *     responses:
	 *       200:
	 *         description: Prerequisite removed successfully
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 */
	routes.delete("/:id/prerequisite/:prerequisiteId", controller.removePrerequisite);

	route.use(path, routes);

	return route;
};
