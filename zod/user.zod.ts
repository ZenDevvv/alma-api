import { z } from "zod";
import { isValidObjectId } from "mongoose";

// ─── Enums matching Prisma ───────────────────────────────────────────

export const Role = z.enum(["user", "admin", "viewer"]);

export const SubRole = z.enum([
	"patient",
	"staff",
	"approver",
	"malasakit",
	"operator",
	"supervisor",
	"super",
]);

export const UserStatus = z.enum(["active", "inactive", "suspended", "archived"]);

// ─── User Model Schema ──────────────────────────────────────────────

export const UserSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	avatar: z.string().optional().nullable(),
	userName: z
		.string()
		.min(3, "Username must be at least 3 characters")
		.max(50, "Username must be at most 50 characters")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Username can only contain letters, numbers, underscores, and hyphens",
		)
		.optional()
		.nullable(),
	email: z.string().email("Invalid email format"),
	password: z.string(),
	role: Role,
	subRole: SubRole.optional().nullable(),
	status: UserStatus.default("active"),
	isDeleted: z.boolean().default(false),
	lastLogin: z.coerce.date().optional().nullable(),
	loginMethod: z.string().min(1),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	personId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	orgId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	departmentId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	avatar: true,
	userName: true,
	isDeleted: true,
	lastLogin: true,
	personId: true,
	orgId: true,
	departmentId: true,
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateUser = z.infer<typeof UpdateUserSchema>;
