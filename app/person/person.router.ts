import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/person";

	/**
	 * @openapi
	 * /api/person/{id}:
	 *   get:
	 *     summary: Get person by id
	 *     description: Get person by id with optional fields to include
	 *     tags: [Person]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: fields
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *     responses:
	 *       200:
	 *         description: Returns person data
	 *       404:
	 *         description: Person not found
	 */
	routes.get("/:id", controller.getById);

	/**
	 * @openapi
	 * /api/person:
	 *   get:
	 *     summary: Get all persons
	 *     description: Get all persons with pagination, sorting, and field selection
	 *     tags: [Person]
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *         description: Page number (default 1)
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *         description: Records per page (default 10)
	 *       - in: query
	 *         name: sort
	 *         schema:
	 *           type: string
	 *         description: Field to sort by
	 *       - in: query
	 *         name: order
	 *         schema:
	 *           type: string
	 *           enum: [asc, desc]
	 *         description: Sort order (default desc)
	 *       - in: query
	 *         name: fields
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include
	 *       - in: query
	 *         name: query
	 *         schema:
	 *           type: string
	 *         description: Search query to filter results
	 *     responses:
	 *       200:
	 *         description: Returns paginated persons list
	 */
	routes.get("/", controller.getAll);

	/**
	 * @openapi
	 * /api/person:
	 *   post:
	 *     summary: Create or find person
	 *     description: Creates a new person or returns existing one if found with same first and last name
	 *     tags: [Person]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - firstName
	 *               - lastName
	 *             properties:
	 *               firstName:
	 *                 type: string
	 *               lastName:
	 *                 type: string
	 *               middleName:
	 *                 type: string
	 *               contactNumber:
	 *                 type: string
	 *               suffix:
	 *                 type: string
	 *               gender:
	 *                 type: string
	 *                 enum: [male, female, others]
	 *               birthDate:
	 *                 type: string
	 *                 format: date-time
	 *               birthPlace:
	 *                 type: string
	 *               age:
	 *                 type: integer
	 *               religion:
	 *                 type: string
	 *               civilStatus:
	 *                 type: string
	 *                 enum: [single, married, separated, widow, cohabiting]
	 *     responses:
	 *       200:
	 *         description: Returns existing person
	 *       201:
	 *         description: Returns newly created person
	 *       400:
	 *         description: Missing required fields
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/person/{id}:
	 *   patch:
	 *     summary: Update person
	 *     description: Update person data by id
	 *     tags: [Person]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               firstName:
	 *                 type: string
	 *               lastName:
	 *                 type: string
	 *               middleName:
	 *                 type: string
	 *               contactNumber:
	 *                 type: string
	 *               suffix:
	 *                 type: string
	 *               gender:
	 *                 type: string
	 *                 enum: [male, female, others]
	 *               birthDate:
	 *                 type: string
	 *                 format: date-time
	 *               birthPlace:
	 *                 type: string
	 *               age:
	 *                 type: integer
	 *               religion:
	 *                 type: string
	 *               civilStatus:
	 *                 type: string
	 *                 enum: [single, married, separated, widow, cohabiting]
	 *     responses:
	 *       200:
	 *         description: Returns updated person
	 *       404:
	 *         description: Person not found
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/person/{id}:
	 *   put:
	 *     summary: Soft delete person
	 *     description: Mark person as deleted without permanently removing the data
	 *     tags: [Person]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: Person marked as deleted successfully
	 *       404:
	 *         description: Person not found
	 */
	routes.patch("/:id", controller.remove);
	route.use(path, routes);

	return route;
};
