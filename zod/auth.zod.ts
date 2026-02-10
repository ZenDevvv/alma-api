import { z } from "zod";

// Emergency Contact Schema - matches EmergencyContact type
export const EmergencyContactSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	relationship: z.string().min(1, "Relationship is required"),
	phoneNumber: z
		.string()
		.min(10, "Phone number must be valid")
		.regex(/^[+]?[0-9()\-\s]+$/, "Invalid phone number format"),
	alternatePhone: z
		.string()
		.regex(/^[+]?[0-9()\-\s]+$/, "Invalid alternate phone format")
		.optional()
		.nullable(),
	email: z.string().email("Invalid email").optional().nullable(),
	address: z.string().optional().nullable(),
	priority: z.number().int().positive().default(1),
	notes: z.string().optional().nullable(),
});

export const EmergencyContactsArraySchema = z
	.array(EmergencyContactSchema)
	.min(1, "At least one emergency contact is required")
	.refine((contacts) => contacts.some((c) => c.priority === 1), {
		message: "At least one emergency contact must have priority 1 (primary)",
	});

// Address Schema - matches Address type in Prisma
export const AddressSchema = z.object({
	type: z
		.enum(["PRIMARY", "BILLING", "MAILING", "WORK", "TEMPORARY", "PREVIOUS", "OTHER"])
		.default("PRIMARY"),
	label: z.string().optional().nullable(),
	addressLine1: z.string().min(1, "Address line 1 is required"),
	addressLine2: z.string().optional().nullable(),
	street: z.string().optional().nullable(),
	building: z.string().optional().nullable(),
	unit: z.string().optional().nullable(),
	city: z.string().min(1, "City is required"),
	district: z.string().optional().nullable(),
	state: z.string().min(1, "State is required"),
	country: z.string().min(1, "Country is required"),
	postalCode: z.string().min(1, "Postal code is required"),
	isPrimary: z.boolean().default(false),
	isVerified: z.boolean().default(false),
	instructions: z.string().optional().nullable(),
});

// Contact Schema - matches Contact type in Prisma
export const ContactSchema = z.object({
	type: z.enum([
		"MOBILE",
		"HOME",
		"WORK",
		"ALTERNATE",
		"FAX",
		"WHATSAPP",
		"TELEGRAM",
		"EMERGENCY",
		"OTHER",
	]),
	phoneNumber: z.string().optional().nullable(),
	email: z.string().email("Invalid email").optional().nullable(),
	countryCode: z.string().optional().nullable(),
	isPrimary: z.boolean().default(false),
	isVerified: z.boolean().default(false),
	label: z.string().optional().nullable(),
});

// Language Schema - matches Language type in Prisma
export const LanguageSchema = z.object({
	languageCode: z.string().min(2, "Language code is required (ISO 639-1)"),
	languageName: z.string().min(1, "Language name is required"),
	proficiency: z.enum(["NATIVE", "FLUENT", "ADVANCED", "INTERMEDIATE", "BASIC"]),
	isNative: z.boolean().default(false),
});

// PersonalInfo Schema - matches PersonalInfo type in Prisma
export const PersonalInfoSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	middleName: z.string().optional().nullable(),
	nameSuffix: z.string().optional().nullable(),
	dateOfBirth: z.string().datetime("Invalid date format"),
	placeOfBirth: z.string().optional().nullable(),
	gender: z
		.enum([
			"MALE",
			"FEMALE",
			"NON_BINARY",
			"TRANSGENDER",
			"INTERSEX",
			"AGENDER",
			"PANGENDER",
			"GENDER_FLUID",
			"TWO_SPIRIT",
			"OTHER",
			"PREFER_NOT_TO_SAY",
		])
		.optional()
		.nullable(),
	nationality: z.string().optional().nullable(),
	height: z.number().optional().nullable(),
	weight: z.number().optional().nullable(),
});

// Documents/Identification Schema (stored as Json in Prisma)
export const IdentificationSchema = z
	.object({
		passportNumber: z.string().optional().nullable(),
		driverLicense: z.string().optional().nullable(),
		socialSecurityNumber: z.string().optional().nullable(),
	})
	.optional()
	.nullable();

// Register Schema - Updated to match Prisma Person model
export const RegisterSchema = z.object({
	email: z.string().email("Invalid email format"),
	orgId: z.string().optional().nullable(),
	departmentId: z.string().optional().nullable(),
	password: z.string().min(6, "Password must be at least 6 characters long"),
	userName: z
		.string()
		.min(3, "Username must be at least 3 characters")
		.max(50, "Username must be at most 50 characters")
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Username can only contain letters, numbers, underscores, and hyphens",
		),
	role: z.enum(["user", "admin", "viewer"]),
	subRole: z
		.enum(["patient", "staff", "approver", "malasakit", "operator", "supervisor", "super"])
		.optional()
		.nullable(),

	// Person-related fields matching Prisma model
	personalInfo: PersonalInfoSchema,
	contactInfo: z.array(ContactSchema).optional().nullable(),
	addresses: z.array(AddressSchema).optional().nullable(),
	languages: z.array(LanguageSchema).optional().nullable(),
	preferredLanguage: z.string().optional().nullable(),
	documents: IdentificationSchema,
	emergencyContacts: z.array(EmergencyContactSchema).optional().nullable(),
	kycStatus: z
		.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "RESUBMISSION_REQUIRED"])
		.default("PENDING")
		.optional(),
});

export const LoginSchema = z.object({
	identifier: z
		.string()
		.email("Invalid email format")
		.or(z.string().min(1, "Username is required")),
	password: z.string().min(1, "Password is required"),
});

export const UpdatePasswordSchema = z.object({
	userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format"),
	password: z.string().min(6, "Password must be at least 6 characters long"),
});
