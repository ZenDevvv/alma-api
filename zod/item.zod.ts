import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Item Schema (full, including ID)
export const ItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Item = z.infer<typeof ItemSchema>;

// Create Item Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateItemSchema = ItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateTemplate = z.infer<typeof CreateItemSchema>;

// Update Item Schema (partial, excluding immutable fields and relations)
export const UpdateItemSchema = ItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});

export type UpdateTemplate = z.infer<typeof UpdateItemSchema>;
