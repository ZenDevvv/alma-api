import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { PersonSchema } from "./person.zod";
import { OrganizationSchema } from "./organization.zod";
import { PaginationSchema } from "./common.zod";

// ─── Enums matching Prisma ───────────────────────────────────────────

export const Role = z.enum(["user", "admin", "viewer"]);

export const SubRole = z.enum([
	"student",
	"instructor",
	"org_admin",
	"superadmin"
]);

export const UserStatus = z.enum(["active", "inactive", "suspended", "archived"]);

// ─── User Model Schema ──────────────────────────────────────────────

export const UserSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	avatar: z.string().optional(),
	userName: z
		.string()
		.min(3, "Username must be at least 3 characters")
		.max(50, "Username must be at most 50 characters")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Username can only contain letters, numbers, underscores, and hyphens",
		)
		.optional()
		,
	email: z.string().email("Invalid email format"),
	password: z.string(),
	role: Role,
	subRole: z.array(SubRole),
	status: UserStatus.default("active"),
	isDeleted: z.boolean().default(false),
	lastLogin: z.coerce.date().optional(),
	loginMethod: z.string().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	// --- Foreign key IDs ---
	personId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		,
	orgId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		,

	// --- Relation fields (from Prisma model) ---
	person: PersonSchema.optional(),
	organization: OrganizationSchema.optional(),
});

export type User = z.infer<typeof UserSchema>;

// ─── GetAll Schema ──────────────────────────────────────────────────

export const GetAllUsersSchema = z.object({
	users: z.array(UserSchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllUsers = z.infer<typeof GetAllUsersSchema>;

export const CreateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	// Omit relation fields — use foreign key IDs instead
	person: true,
	organization: true,
}).partial({
	avatar: true,
	isDeleted: true,
	lastLogin: true,
	personId: true,
	orgId: true,
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	// Omit relation fields — use foreign key IDs instead
	person: true,
	organization: true,
}).partial();

export type UpdateUser = z.infer<typeof UpdateUserSchema>;
