import { z } from "zod";
import { isValidObjectId } from "mongoose";


// Role Schema (full, including ID)
export const RoleSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Role = z.infer<typeof RoleSchema>;

// Create Role Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateRoleSchema = RoleSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateTemplate = z.infer<typeof CreateRoleSchema>;

// Update Role Schema (partial, excluding immutable fields and relations)
export const UpdateRoleSchema = RoleSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateTemplate = z.infer<typeof UpdateRoleSchema>;
