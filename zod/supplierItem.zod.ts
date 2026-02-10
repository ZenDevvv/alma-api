import { z } from "zod";
import { isValidObjectId } from "mongoose";

// SupplierItem Schema (full, including ID)
export const SupplierItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid MongoDB ObjectId",
	}),
	supplierId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid supplier ID",
	}),
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid product ID",
	}),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type SupplierItem = z.infer<typeof SupplierItemSchema>;

// Create SupplierItem Schema (excluding ID, createdAt, updatedAt, isDeleted)
export const CreateSupplierItemSchema = z.object({
	supplierId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid supplier ID",
	}),
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid product ID",
	}),
});

export type CreateSupplierItem = z.infer<typeof CreateSupplierItemSchema>;

// Update SupplierItem Schema (partial, excluding immutable fields)
export const UpdateSupplierItemSchema = z
	.object({
		supplierId: z
			.string()
			.refine((val) => isValidObjectId(val), {
				message: "Invalid supplier ID",
			})
			.optional(),
		productId: z
			.string()
			.refine((val) => isValidObjectId(val), {
				message: "Invalid product ID",
			})
			.optional(),
		isDeleted: z.boolean().optional(),
	})
	.strict();

export type UpdateSupplierItem = z.infer<typeof UpdateSupplierItemSchema>;

// Query/Filter Schema
export const QuerySupplierItemSchema = z.object({
	groupBy: z.string().optional(),
});

export type QuerySupplierItem = z.infer<typeof QuerySupplierItemSchema>;
