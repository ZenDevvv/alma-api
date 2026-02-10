import { z } from "zod";
import { Role, SubRole } from "./user.zod";
import {
	PersonalInfoSchema,
	ContactSchema,
	AddressSchema,
	LanguageSchema,
	EmergencyContactSchema,
	DocumentsSchema,
	KYCStatus,
} from "./person.zod";

// ─── Register Schema (User fields + nested Person object) ───────────

export const RegisterPersonSchema = z.object({
	personalInfo: PersonalInfoSchema,
	contactInfo: z.array(ContactSchema).optional().nullable(),
	addresses: z.array(AddressSchema).optional().nullable(),
	languages: z.array(LanguageSchema).optional().nullable(),
	preferredLanguage: z.string().optional().nullable(),
	documents: DocumentsSchema,
	emergencyContacts: z.array(EmergencyContactSchema).optional().nullable(),
	kycStatus: KYCStatus.default("PENDING").optional(),
});

export const RegisterSchema = z.object({
	// User fields
	email: z.string().email("Invalid email format"),
	password: z.string().min(6, "Password must be at least 6 characters long"),
	userName: z
		.string()
		.min(3, "Username must be at least 3 characters")
		.max(50, "Username must be at most 50 characters")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Username can only contain letters, numbers, underscores, and hyphens",
		),
	role: Role,
	subRole: SubRole.optional().nullable(),
	orgId: z.string().optional().nullable(),
	departmentId: z.string().optional().nullable(),

	// Person fields (nested)
	person: RegisterPersonSchema,
});

export type Register = z.infer<typeof RegisterSchema>;

// ─── Login Schema ───────────────────────────────────────────────────

export const LoginSchema = z.object({
	identifier: z
		.string()
		.email("Invalid email format")
		.or(z.string().min(1, "Username is required")),
	password: z.string().min(1, "Password is required"),
});

export type Login = z.infer<typeof LoginSchema>;

// ─── Update Password Schema ────────────────────────────────────────

export const UpdatePasswordSchema = z.object({
	userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format"),
	password: z.string().min(6, "Password must be at least 6 characters long"),
});

export type UpdatePassword = z.infer<typeof UpdatePasswordSchema>;
