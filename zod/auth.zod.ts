import { z } from "zod";
import { CreateUserSchema } from "./user.zod";
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
	contactInfo: z.array(ContactSchema).optional(),
	addresses: z.array(AddressSchema).optional(),
	languages: z.array(LanguageSchema).optional(),
	preferredLanguage: z.string().optional(),
	documents: DocumentsSchema,
	emergencyContacts: z.array(EmergencyContactSchema).optional(),
	kycStatus: KYCStatus.default("PENDING").optional(),
});

export const RegisterSchema = CreateUserSchema.pick({
	email: true,
	password: true,
	userName: true,
	role: true,
	subRole: true,
	orgId: true,
}).required({
	userName: true,
}).extend({
	password: z.string().min(6, "Password must be at least 6 characters long"),
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
