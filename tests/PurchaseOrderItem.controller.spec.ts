import { controller } from "../app/PurchaseOrderItem/PurchaseOrderItem.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("PurchaseOrderItem Controller", () => {
	let PurchaseOrderItemController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockPurchaseOrderItem = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration PurchaseOrderItem",
		description: "PurchaseOrderItem for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockPurchaseOrderItems = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration PurchaseOrderItem",
			description: "PurchaseOrderItem for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification PurchaseOrderItem",
			description: "PurchaseOrderItem for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing PurchaseOrderItem",
			description: "PurchaseOrderItem for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic PurchaseOrderItem",
			description: "PurchaseOrderItem without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			PurchaseOrderItem: {
				findMany: async (_params: Prisma.PurchaseOrderItemFindManyArgs) => {
					// Return multiple PurchaseOrderItems for grouping tests
					if (req.query?.groupBy) {
						return mockPurchaseOrderItems;
					}
					return [mockPurchaseOrderItem];
				},
				count: async (_params: Prisma.PurchaseOrderItemCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockPurchaseOrderItems.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.PurchaseOrderItemFindFirstArgs) =>
					params.where?.id === mockPurchaseOrderItem.id ? mockPurchaseOrderItem : null,
				findUnique: async (params: Prisma.PurchaseOrderItemFindUniqueArgs) =>
					params.where?.id === mockPurchaseOrderItem.id ? mockPurchaseOrderItem : null,
				create: async (params: Prisma.PurchaseOrderItemCreateArgs) => ({
					...mockPurchaseOrderItem,
					...params.data,
				}),
				update: async (params: Prisma.PurchaseOrderItemUpdateArgs) => ({
					...mockPurchaseOrderItem,
					...params.data,
				}),
				delete: async (params: Prisma.PurchaseOrderItemDeleteArgs) => ({
					...mockPurchaseOrderItem,
					id: params.where.id,
				}),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		PurchaseOrderItemController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			get: (header: string) => {
				if (header === "Content-Type") {
					return "application/json";
				}
				return undefined;
			},
			originalUrl: "/api/PurchaseOrderItem",
		} as Request;
		res = {
			send: (data: any) => {
				sentData = data;
				return res;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
			end: () => res,
		} as Response;
		next = () => {};
	});

	describe(".getAll()", () => {
		it("should return paginated PurchaseOrderItems", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group PurchaseOrderItems by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "type");
			expect(sentData.data).to.have.property("totalGroups");
			expect(sentData.data).to.have.property("totalItems");
			expect(sentData.data.grouped).to.have.property("email");
			expect(sentData.data.grouped).to.have.property("sms");
			expect(sentData.data.grouped).to.have.property("unassigned");
		});

		it("should group PurchaseOrderItems by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "name");
			expect(sentData.data.grouped).to.have.property("User Registration PurchaseOrderItem");
			expect(sentData.data.grouped).to.have.property("SMS Notification PurchaseOrderItem");
		});

		it("should handle PurchaseOrderItems with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.grouped).to.have.property("unassigned");
			expect(sentData.data.grouped.unassigned).to.be.an("array");
			expect(sentData.data.grouped.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
			expect(sentData.data).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw an error
			prisma.purchaseorderitem.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw a non-Prisma error
			prisma.purchaseorderitem.findMany = async () => {
				throw new Error("Internal server error");
			};

			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle advanced filtering", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				query: "email",
				filter: JSON.stringify([{ field: "type", operator: "equals", value: "email" }]),
			};
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { documents: "true" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a PurchaseOrderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };
			await PurchaseOrderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockPurchaseOrderItem.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await PurchaseOrderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent PurchaseOrderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await PurchaseOrderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };

			// Mock Prisma to throw an error
			prisma.purchaseorderitem.findUnique = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await PurchaseOrderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.purchaseorderitem.findUnique = async () => {
				throw new Error("Internal server error");
			};

			await PurchaseOrderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new PurchaseOrderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Contact Form PurchaseOrderItem",
				description: "PurchaseOrderItem for contact forms with validation",
			};
			req.body = createData;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new PurchaseOrderItem with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Email PurchaseOrderItem",
				description: "PurchaseOrderItem for email notifications",
				type: "email",
			};
			req.body = createData;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			expect(sentData.data).to.have.property("type", "email");
		});

		it("should create a new PurchaseOrderItem without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Generic PurchaseOrderItem",
				description: "PurchaseOrderItem without type",
			};
			req.body = createData;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Form PurchaseOrderItem",
				description: "PurchaseOrderItem from form data",
				type: "form",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "URL PurchaseOrderItem",
				description: "PurchaseOrderItem from URL encoded data",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "",
				description: "PurchaseOrderItem with empty name",
			};
			req.body = createData;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test PurchaseOrderItem",
				description: "PurchaseOrderItem that will cause Prisma error",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.purchaseorderitem.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test PurchaseOrderItem",
				description: "PurchaseOrderItem that will cause internal error",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.purchaseorderitem.create = async () => {
				throw new Error("Internal server error");
			};

			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update PurchaseOrderItem details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Enhanced Contact Form PurchaseOrderItem",
				description: "Updated PurchaseOrderItem with additional validation and styling options",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update PurchaseOrderItem type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "sms",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update multiple PurchaseOrderItem fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Email PurchaseOrderItem",
				description: "Updated description",
				type: "email",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Form Updated PurchaseOrderItem",
				description: "Updated from form data",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "URL Updated PurchaseOrderItem",
				description: "Updated from URL encoded data",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated PurchaseOrderItem",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "",
				description: "PurchaseOrderItem with empty name",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent PurchaseOrderItem update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated PurchaseOrderItem",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test PurchaseOrderItem",
				description: "PurchaseOrderItem that will cause Prisma error",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.purchaseorderitem.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test PurchaseOrderItem",
				description: "PurchaseOrderItem that will cause internal error",
			};
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.purchaseorderitem.update = async () => {
				throw new Error("Internal server error");
			};

			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a PurchaseOrderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };
			await PurchaseOrderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await PurchaseOrderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent PurchaseOrderItem deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await PurchaseOrderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };

			// Mock Prisma to throw an error
			prisma.purchaseorderitem.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await PurchaseOrderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.purchaseorderitem.delete = async () => {
				throw new Error("Internal server error");
			};

			await PurchaseOrderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long PurchaseOrderItem name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "A".repeat(1000), // Very long name
				description: "PurchaseOrderItem with very long name",
			};
			req.body = createData;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in PurchaseOrderItem data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "PurchaseOrderItem with special chars: !@#$%^&*()",
				description: "Description with émojis 🚀 and unicode",
				type: "special-type",
			};
			req.body = createData;
			await PurchaseOrderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Concurrent PurchaseOrderItem",
				description: "PurchaseOrderItem created concurrently",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => PurchaseOrderItemController.create(req as Request, res, next));

			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle malformed JSON in filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				filter: "invalid-json",
			};
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await PurchaseOrderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = {}; // Empty body
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockPurchaseOrderItem.id };
			req.body = { name: "Only name updated" }; // Only name, no description or type
			await PurchaseOrderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "PurchaseOrderItem 1", type: "email", category: "marketing" },
		{ id: 2, name: "PurchaseOrderItem 2", type: "sms", category: "notification" },
		{ id: 3, name: "PurchaseOrderItem 3", type: "email", category: "marketing" },
		{ id: 4, name: "PurchaseOrderItem 4", type: null, category: "general" },
		{ id: 5, name: "PurchaseOrderItem 5", type: "push", category: "notification" },
	];

	describe("groupDataByField()", () => {
		it("should group data by type field", () => {
			const result = groupDataByField(testData, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("sms");
			expect(result).to.have.property("push");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(2);
			expect(result.sms).to.have.length(1);
			expect(result.push).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should group data by category field", () => {
			const result = groupDataByField(testData, "category");
			expect(result).to.have.property("marketing");
			expect(result).to.have.property("notification");
			expect(result).to.have.property("general");
			expect(result.marketing).to.have.length(2);
			expect(result.notification).to.have.length(2);
			expect(result.general).to.have.length(1);
		});

		it("should handle null values by placing them in unassigned group", () => {
			const result = groupDataByField(testData, "type");
			expect(result.unassigned).to.have.length(1);
			expect(result.unassigned[0]).to.deep.include({ id: 4, type: null });
		});

		it("should handle undefined values by placing them in unassigned group", () => {
			const dataWithUndefined = [
				{ id: 1, name: "PurchaseOrderItem 1", type: "email" },
				{ id: 2, name: "PurchaseOrderItem 2" }, // missing type field
			];
			const result = groupDataByField(dataWithUndefined, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should return empty object for empty array", () => {
			const result = groupDataByField([], "type");
			expect(result).to.be.an("object");
			expect(Object.keys(result)).to.have.length(0);
		});

		it("should group by string values correctly", () => {
			const result = groupDataByField(testData, "name");
			expect(result).to.have.property("PurchaseOrderItem 1");
			expect(result).to.have.property("PurchaseOrderItem 2");
			expect(result).to.have.property("PurchaseOrderItem 3");
			expect(result).to.have.property("PurchaseOrderItem 4");
			expect(result).to.have.property("PurchaseOrderItem 5");
			expect(result["PurchaseOrderItem 1"]).to.have.length(1);
		});
	});
});
