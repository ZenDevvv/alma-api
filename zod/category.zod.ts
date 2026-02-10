import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const CategorySchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string(),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Category = z.infer<typeof CategorySchema>;

export const CreateCategorySchema = CategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateCategory = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});
