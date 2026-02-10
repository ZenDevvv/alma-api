import { z } from "zod";
import { isValidObjectId } from "mongoose";


// Stock Schema (full, including ID)
export const StockSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Stock = z.infer<typeof StockSchema>;

// Create Stock Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateStockSchema = StockSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateTemplate = z.infer<typeof CreateStockSchema>;

// Update Stock Schema (partial, excluding immutable fields and relations)
export const UpdateStockSchema = StockSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateTemplate = z.infer<typeof UpdateStockSchema>;
