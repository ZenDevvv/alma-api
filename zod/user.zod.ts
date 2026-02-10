import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Match your Prisma enum values exactly
export const Role = z.enum(["user", "admin", "viewer"]);

export const SubRole = z.enum(["learner", "instructor", "org_admin"]);

export const Status = z.enum(["active", "inactive", "suspended", "archived"]);

// User Schema (full, including ID)
export const UserSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	avatar: z.string().optional(),
	userName: z.string().optional(),
	email: z.string().min(1),
	password: z.string(),
	role: Role,
	subRole: SubRole.optional(),
	status: Status.default("active"),
	isDeleted: z.boolean().default(false),
	lastLogin: z.coerce.date().optional(),
	loginMethod: z.string().min(1),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	personId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
	orgId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	avatar: true,
	userName: true,
	password: true,
	isDeleted: true,
	lastLogin: true,
	personId: true,
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateUser = z.infer<typeof UpdateUserSchema>;
