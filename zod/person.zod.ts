import { z } from "zod";
import { isValidObjectId } from "mongoose";

// ─── Enums matching Prisma ───────────────────────────────────────────

export const GenderType = z.enum([
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
]);

export const ContactType = z.enum([
	"MOBILE",
	"HOME",
	"WORK",
	"ALTERNATE",
	"FAX",
	"WHATSAPP",
	"TELEGRAM",
	"EMERGENCY",
	"OTHER",
]);

export const AddressType = z.enum([
	"PRIMARY",
	"BILLING",
	"MAILING",
	"WORK",
	"TEMPORARY",
	"PREVIOUS",
	"OTHER",
]);

export const LanguageProficiency = z.enum([
	"NATIVE",
	"FLUENT",
	"ADVANCED",
	"INTERMEDIATE",
	"BASIC",
]);

export const KYCStatus = z.enum([
	"PENDING",
	"IN_REVIEW",
	"APPROVED",
	"REJECTED",
	"EXPIRED",
	"RESUBMISSION_REQUIRED",
]);

// ─── Composite Type Schemas (matching Prisma types) ─────────────────

export const PersonalInfoSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	middleName: z.string().optional(),
	nameSuffix: z.string().optional(),
	dateOfBirth: z.string().datetime("Invalid date format").optional(),
	placeOfBirth: z.string().optional(),
	gender: GenderType.optional(),
	nationality: z.string().optional(),
	height: z.number().optional(),
	weight: z.number().optional(),
});

export const ContactSchema = z.object({
	type: ContactType,
	phoneNumber: z.string().optional(),
	email: z.string().email("Invalid email").optional(),
	countryCode: z.string().optional(),
	isPrimary: z.boolean().default(false),
	isVerified: z.boolean().default(false),
	label: z.string().optional(),
});

export const AddressSchema = z.object({
	type: AddressType.default("PRIMARY"),
	label: z.string().optional(),
	addressLine1: z.string().min(1, "Address line 1 is required"),
	addressLine2: z.string().optional(),
	street: z.string().optional(),
	building: z.string().optional(),
	unit: z.string().optional(),
	city: z.string().min(1, "City is required"),
	district: z.string().optional(),
	state: z.string().min(1, "State is required"),
	country: z.string().min(1, "Country is required"),
	postalCode: z.string().min(1, "Postal code is required"),
	isPrimary: z.boolean().default(false),
	isVerified: z.boolean().default(false),
	instructions: z.string().optional(),
});

export const LanguageSchema = z.object({
	languageCode: z.string().min(2, "Language code is required (ISO 639-1)"),
	languageName: z.string().min(1, "Language name is required"),
	proficiency: LanguageProficiency,
	isNative: z.boolean().default(false),
});

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
		,
	email: z.string().email("Invalid email").optional(),
	address: z.string().optional(),
	priority: z.number().int().positive().default(1),
	notes: z.string().optional(),
});

export const DocumentsSchema = z
	.object({
		passportNumber: z.string().optional(),
		driverLicense: z.string().optional(),
		socialSecurityNumber: z.string().optional(),
	})
	.optional()
	;

// ─── Person Model Schema ────────────────────────────────────────────

export const PersonSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	personalInfo: PersonalInfoSchema,
	contactInfo: z.array(ContactSchema),
	addresses: z.array(AddressSchema),
	languages: z.array(LanguageSchema),
	preferredLanguage: z.string().optional(),
	documents: DocumentsSchema,
	emergencyContacts: z.array(EmergencyContactSchema),
	kycStatus: KYCStatus.default("PENDING"),
	kycCompletedAt: z.coerce.date().optional(),
	lastVerifiedAt: z.coerce.date().optional(),
	orgId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		,
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Person = z.infer<typeof PersonSchema>;

export const CreatePersonSchema = PersonSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	kycCompletedAt: true,
	lastVerifiedAt: true,
}).partial({
	contactInfo: true,
	addresses: true,
	languages: true,
	preferredLanguage: true,
	documents: true,
	emergencyContacts: true,
	kycStatus: true,
	orgId: true,
});

export type CreatePerson = z.infer<typeof CreatePersonSchema>;

export const UpdatePersonSchema = PersonSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdatePerson = z.infer<typeof UpdatePersonSchema>;
