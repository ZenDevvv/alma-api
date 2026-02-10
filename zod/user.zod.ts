import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Match your Prisma enum values exactly
export const Role = z.enum(["user", "admin", "viewer"]);

export const SubRole = z.enum([
	"super",
	"supervisor",
	"approver",
	"staff",
	"operator",
	"malasakit",
	"patient",
]);

export const Status = z.enum(["active", "inactive", "suspended", "archived"]);

// User Schema (full, including ID)
export const UserSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	personId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
	avatar: z.string().optional(),
	userName: z.string().optional(),
	email: z.string().min(1),
	password: z.string().optional(),
	role: Role,
	subRole: SubRole.optional(),
	status: Status.default("active"),
	isDeleted: z.boolean().default(false),
	lastLogin: z.coerce.date().optional(),
	loginMethod: z.string().min(1),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	departmentId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.nullable()
		.optional(),
	locationId: z
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
	departmentId: true,
	locationId: true,
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateUser = z.infer<typeof UpdateUserSchema>;
