import { controller } from "../app/medicine/medicine.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Medicine Controller", () => {
	let medicineController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockMedicine = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration Medicine",
		description: "Medicine for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockMedicines = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration Medicine",
			description: "Medicine for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification Medicine",
			description: "Medicine for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing Medicine",
			description: "Medicine for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic Medicine",
			description: "Medicine without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			medicine: {
				findMany: async (_params: Prisma.MedicineFindManyArgs) => {
					// Return multiple medicines for grouping tests
					if (req.query?.groupBy) {
						return mockMedicines;
					}
					return [mockMedicine];
				},
				count: async (_params: Prisma.MedicineCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockMedicines.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.MedicineFindFirstArgs) =>
					params.where?.id === mockMedicine.id ? mockMedicine : null,
				findUnique: async (params: Prisma.MedicineFindUniqueArgs) =>
					params.where?.id === mockMedicine.id ? mockMedicine : null,
				create: async (params: Prisma.MedicineCreateArgs) => ({
					...mockMedicine,
					...params.data,
				}),
				update: async (params: Prisma.MedicineUpdateArgs) => ({
					...mockMedicine,
					...params.data,
				}),
				delete: async (params: Prisma.MedicineDeleteArgs) => ({
					...mockMedicine,
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

		medicineController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/medicine",
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
		it("should return paginated medicines", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group medicines by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await medicineController.getAll(req as Request, res, next);
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

		it("should group medicines by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "name");
			expect(sentData.data.grouped).to.have.property("User Registration Medicine");
			expect(sentData.data.grouped).to.have.property("SMS Notification Medicine");
		});

		it("should handle medicines with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.grouped).to.have.property("unassigned");
			expect(sentData.data.grouped.unassigned).to.be.an("array");
			expect(sentData.data.grouped.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
			expect(sentData.data).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw an error
			prisma.medicine.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw a non-Prisma error
			prisma.medicine.findMany = async () => {
				throw new Error("Internal server error");
			};

			await medicineController.getAll(req as Request, res, next);
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
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { documents: "true" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a medicine", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };
			await medicineController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockMedicine.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await medicineController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent medicine", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await medicineController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };

			// Mock Prisma to throw an error
			prisma.medicine.findUnique = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await medicineController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.medicine.findUnique = async () => {
				throw new Error("Internal server error");
			};

			await medicineController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new medicine", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Contact Form Medicine",
				description: "Medicine for contact forms with validation",
			};
			req.body = createData;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new medicine with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Email Medicine",
				description: "Medicine for email notifications",
				type: "email",
			};
			req.body = createData;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			expect(sentData.data).to.have.property("type", "email");
		});

		it("should create a new medicine without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Generic Medicine",
				description: "Medicine without type",
			};
			req.body = createData;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Form Medicine",
				description: "Medicine from form data",
				type: "form",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "URL Medicine",
				description: "Medicine from URL encoded data",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "",
				description: "Medicine with empty name",
			};
			req.body = createData;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test Medicine",
				description: "Medicine that will cause Prisma error",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.medicine.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test Medicine",
				description: "Medicine that will cause internal error",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.medicine.create = async () => {
				throw new Error("Internal server error");
			};

			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update medicine details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Enhanced Contact Form Medicine",
				description: "Updated medicine with additional validation and styling options",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update medicine type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "sms",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update multiple medicine fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Email Medicine",
				description: "Updated description",
				type: "email",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Form Updated Medicine",
				description: "Updated from form data",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "URL Updated Medicine",
				description: "Updated from URL encoded data",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Medicine",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "",
				description: "Medicine with empty name",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent medicine update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Medicine",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test Medicine",
				description: "Medicine that will cause Prisma error",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.medicine.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test Medicine",
				description: "Medicine that will cause internal error",
			};
			req.params = { id: mockMedicine.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.medicine.update = async () => {
				throw new Error("Internal server error");
			};

			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a medicine", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };
			await medicineController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await medicineController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent medicine deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await medicineController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };

			// Mock Prisma to throw an error
			prisma.medicine.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await medicineController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.medicine.delete = async () => {
				throw new Error("Internal server error");
			};

			await medicineController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long medicine name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "A".repeat(1000), // Very long name
				description: "Medicine with very long name",
			};
			req.body = createData;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in medicine data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Medicine with special chars: !@#$%^&*()",
				description: "Description with émojis 🚀 and unicode",
				type: "special-type",
			};
			req.body = createData;
			await medicineController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Concurrent Medicine",
				description: "Medicine created concurrently",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => medicineController.create(req as Request, res, next));

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
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await medicineController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };
			req.body = {}; // Empty body
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockMedicine.id };
			req.body = { name: "Only name updated" }; // Only name, no description or type
			await medicineController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "Medicine 1", type: "email", category: "marketing" },
		{ id: 2, name: "Medicine 2", type: "sms", category: "notification" },
		{ id: 3, name: "Medicine 3", type: "email", category: "marketing" },
		{ id: 4, name: "Medicine 4", type: null, category: "general" },
		{ id: 5, name: "Medicine 5", type: "push", category: "notification" },
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
				{ id: 1, name: "Medicine 1", type: "email" },
				{ id: 2, name: "Medicine 2" }, // missing type field
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
			expect(result).to.have.property("Medicine 1");
			expect(result).to.have.property("Medicine 2");
			expect(result).to.have.property("Medicine 3");
			expect(result).to.have.property("Medicine 4");
			expect(result).to.have.property("Medicine 5");
			expect(result["Medicine 1"]).to.have.length(1);
		});
	});
});
