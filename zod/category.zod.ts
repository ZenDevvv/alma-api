import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { OrganizationSchema } from "./organization.zod";
import { PaginationSchema } from "./common.zod";

export const CategoryStatus = z.enum(["active", "archived"]);

export const CategorySchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	status: CategoryStatus.default("active"),

	// Foreign key IDs
	orgId: z.string().refine((val) => isValidObjectId(val)),

	isDeleted: z.boolean(),
	createdBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	updatedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	// Relation fields (only where this model owns the foreign key)
	organization: OrganizationSchema.optional(),
});

export type Category = z.infer<typeof CategorySchema>;

export const GetAllCategoriesSchema = z.object({
	categories: z.array(CategorySchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllCategories = z.infer<typeof GetAllCategoriesSchema>;

export const CreateCategorySchema = CategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	organization: true,
}).partial({
	description: true,
	status: true,
	isDeleted: true,
	createdBy: true,
	updatedBy: true,
});

export type CreateCategory = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CategorySchema.omit({
	id: true,
	orgId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	createdBy: true,
	organization: true,
}).partial();

export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;
