import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";
import { controller } from "../app/deliveryOrder/deliveryOrder.controller";

const TEST_TIMEOUT = 5000;

describe("DeliveryOrder Controller Source Fix", () => {
	let deliveryOrderController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;

	const mockDepartment = {
		id: "dept_1",
		name: "Logistics",
	};

	const mockSupplier = {
		id: "supp_1",
		name: "Supplier ABC",
	};

	const mockDeliveryOrderWithDepartment = {
		id: "do_1",
		orderNumber: "DO-1",
		sourceType: "department",
		sourceId: mockDepartment.id,
		name: "Order from department",
	};

	const mockDeliveryOrderWithSupplier = {
		id: "do_2",
		orderNumber: "DO-2",
		sourceType: "supplier",
		sourceId: mockSupplier.id,
		name: "Order from supplier",
	};

	beforeEach(() => {
		prisma = {
			deliveryOrder: {
				findFirst: async (args: Prisma.DeliveryOrderFindFirstArgs) => {
					if (
						args.where?.id === mockDeliveryOrderWithDepartment.id ||
						args.where?.orderNumber === mockDeliveryOrderWithDepartment.orderNumber
					) {
						return mockDeliveryOrderWithDepartment;
					}
					if (
						args.where?.id === mockDeliveryOrderWithSupplier.id ||
						args.where?.orderNumber === mockDeliveryOrderWithSupplier.orderNumber
					) {
						return mockDeliveryOrderWithSupplier;
					}
					return null;
				},
				findMany: async (_args: Prisma.DeliveryOrderFindManyArgs) => {
					return [mockDeliveryOrderWithDepartment, mockDeliveryOrderWithSupplier];
				},
				count: async (_args: Prisma.DeliveryOrderCountArgs) => {
					return 2;
				},
			},
			department: {
				findFirst: async (args: Prisma.DepartmentFindFirstArgs) => {
					if (args.where?.id === mockDepartment.id) {
						return mockDepartment;
					}
					return null;
				},
				findMany: async (args: Prisma.DepartmentFindManyArgs) => {
					if ((args.where?.id as any)?.in?.includes(mockDepartment.id)) {
						return [mockDepartment];
					}
					return [];
				},
			},
			supplier: {
				findFirst: async (args: Prisma.SupplierFindFirstArgs) => {
					if (args.where?.id === mockSupplier.id) {
						return mockSupplier;
					}
					return null;
				},
				findMany: async (args: Prisma.SupplierFindManyArgs) => {
					if ((args.where?.id as any)?.in?.includes(mockSupplier.id)) {
						return [mockSupplier];
					}
					return [];
				},
			},
		};

		deliveryOrderController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
		} as Request;
		res = {
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
		} as Response;
		next = () => {};
	});

	describe("getById with field selection", () => {
		it("should return the delivery order with source when fields do not include sourceId and sourceType", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { identifier: mockDeliveryOrderWithDepartment.id };
			req.query = { fields: "name,orderNumber" }; // Does not include sourceId or sourceType

			await deliveryOrderController.getById(req as Request, res, next);

			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("source");
			expect(sentData.data.source).to.deep.equal(mockDepartment);
		});
	});

	describe("getAll with field selection", () => {
		it("should return all delivery orders with their sources when fields are specified", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,orderNumber", document: "true" };

			await deliveryOrderController.getAll(req as Request, res, next);

			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.deliveryOrders).to.be.an("array").with.lengthOf(2);

			const order1 = sentData.data.deliveryOrders.find(
				(o: any) => o.id === mockDeliveryOrderWithDepartment.id,
			);
			expect(order1).to.exist;
			expect(order1.source).to.deep.equal(mockDepartment);

			const order2 = sentData.data.deliveryOrders.find(
				(o: any) => o.id === mockDeliveryOrderWithSupplier.id,
			);
			expect(order2).to.exist;
			expect(order2.source).to.deep.equal(mockSupplier);
		});
	});
});
