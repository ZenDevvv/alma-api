import { z } from "zod";
import { isValidObjectId } from "mongoose";

const mongoIdValidator = z.string().refine((val) => isValidObjectId(val), "Invalid MongoDB ID");

// ProductType Schema (full, including ID)
export const ProductTypeSchema = z.object({
	id: mongoIdValidator,
	name: z.string().min(1, "Name is required"),
	description: z.string().min(1).nullable().optional(),
	categoryId: mongoIdValidator,
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ProductType = z.infer<typeof ProductTypeSchema>;

// Create ProductType Schema (excluding ID, isDeleted, createdAt, updatedAt)
export const CreateProductTypeSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().min(1).optional(),
	categoryId: mongoIdValidator,
});

export type CreateProductType = z.infer<typeof CreateProductTypeSchema>;

// Update ProductType Schema (partial, excluding immutable fields)
export const UpdateProductTypeSchema = z
	.object({
		name: z.string().min(1, "Name is required").optional(),
		description: z.string().min(1).nullable().optional(),
		categoryId: mongoIdValidator.optional(),
		isDeleted: z.boolean().optional(),
	})
	.strict();

export type UpdateProductType = z.infer<typeof UpdateProductTypeSchema>;

// Query Schema for filtering/grouping
export const QueryProductTypeSchema = z.object({
	id: mongoIdValidator.optional(),
	categoryId: mongoIdValidator.optional(),
	isDeleted: z.boolean().optional(),
	groupBy: z.enum(["categoryId"]).optional(),
});

export type QueryProductType = z.infer<typeof QueryProductTypeSchema>;
