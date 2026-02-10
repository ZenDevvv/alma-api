// src/app/inventoryRecord/stock-record.router.ts
import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IStockRecordController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	adjustStockQuantity(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IStockRecordController): Router => {
	const routes = Router();
	const path = "/stock-record";

	/**
	 * @openapi
	 * /api/stock-record/{id}:
	 *   get:
	 *     summary: Get stock record by ID
	 *     tags: [StockRecord]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *         pattern: '^[0-9a-fA-F]{24}$'
	 *       - in: query
	 *         name: fields
	 *         schema:
	 *           type: string
	 *         description: "Comma-separated fields (e.g. totalStock,status,product.name,department.name)"
	 *     responses:
	 *       200:
	 *         description: Success
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query.fields as string) || "full";
				return `cache:stockRecord:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/stock-record:
	 *   get:
	 *     summary: Get all stock records
	 *     tags: [StockRecord]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           default: 1
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           default: 10
	 *       - in: query
	 *         name: departmentId
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: status
	 *         schema:
	 *           type: string
	 *           enum: [in_stock, low_stock, out_of_stock, expired, near_expiry, damaged, quarantined]
	 *     responses:
	 *       200:
	 *         description: Success
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:stockRecord:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/stock-record:
	 *   post:
	 *     summary: Create initial stock record
	 *     tags: [StockRecord]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [departmentId, productId, totalStock]
	 *             properties:
	 *               departmentId:
	 *                 type: string
	 *               productId:
	 *                 type: string
	 *               totalStock:
	 *                 type: integer
	 *                 minimum: 0
	 *               status:
	 *                 type: string
	 *                 enum: [in_stock, low_stock, out_of_stock, expired, near_expiry, damaged, quarantined]
	 *     responses:
	 *       201:
	 *         description: Created
	 */
	routes.post("/", controller.create);

	/**
  73   * @openapi
   * /api/stock-record/adjust:
   *   post:
   *     summary: Adjust stock quantity (MAIN endpoint)
   *     description: |
   *       Use this for receiving, issuing, damage, expiry, transfers.
   *       Positive quantity = add stock, Negative = deduct.
   *     tags: [StockRecord]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - departmentId
   *               - productId
   *               - quantity
   *               - reason
   *             properties:
   *               departmentId:
   *                 type: string
   *               productId:
   *                 type: string
   *               quantity:
   *                 type: integer
   *                 description: "Use positive number to add, negative to deduct"
   *                 example: -5
   *               reason:
   *                 type: string
   *                 example: "Issued to patient"
   *               referenceId:
   *                 type: string
   *               referenceType:
   *                 type: string
   *                 enum: [purchase, issue, damage, expiry, adjustment, transfer]
   *     responses:
   *       200:
   *         description: Stock adjusted
   *       201:
   *         description: First-time record created
   *       400:
   *         description: Validation error or insufficient stock
   */
	routes.post("/adjust", controller.adjustStockQuantity);

	routes.patch("/:id", controller.update);
	routes.put("/:id", controller.update);
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
