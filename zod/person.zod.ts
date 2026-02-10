import { z } from "zod";
import { isValidObjectId } from "mongoose";

// GenderType Enum
export const GenderType = z.enum([
	"male",
	"female",
	"other",
	"prefer_not_to_say",
	"unknown",
	"not_applicable",
]);

export const PhoneType = z.enum([
	"mobile",
	"home",
	"work",
	"emergency",
	"fax",
	"pager",
	"main",
	"other",
]);

export const IdentificationType = z.enum([
	"passport",
	"drivers_license",
	"national_id",
	"postal_id",
	"voters_id",
	"senior_citizen_id",
	"company_id",
	"school_id",
]);

export const PersonalInfoSchema = z.object({
	prefix: z.string().optional(),
	firstName: z.string().min(1),
	middleName: z.string().optional(),
	lastName: z.string().min(1),
	dateOfBirth: z.coerce.date().optional(),
	placeOfBirth: z.string().optional(),
	age: z.number().int().optional(),
	nationality: z.string().optional(),
	primaryLanguage: z.string().optional(),
	gender: z
		.enum(["male", "female", "other", "prefer_not_to_say", "unknown", "not_applicable"])
		.optional(),
	currency: z.string().optional(),
	vipCode: z.string().optional(),
});

export const PhoneSchema = z.object({
	type: z
		.enum(["mobile", "home", "work", "emergency", "fax", "pager", "main", "other"])
		.optional(),
	countryCode: z.string().optional(),
	number: z.string().optional(),
	isPrimary: z.boolean().optional(),
});

export const ContactAddressSchema = z.object({
	street: z.string().optional(),
	address2: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	country: z.string().optional(),
	postalCode: z.string().optional(),
	zipCode: z.string().optional(),
	houseNumber: z.string().optional(),
});

export const ContactInfoSchema = z.object({
	email: z.string().optional(),
	phones: z.array(PhoneSchema).optional(),
	fax: z.string().optional(),
	address: z.union([ContactAddressSchema, z.array(ContactAddressSchema)]).optional(),
});

export const IdentificationSchema = z.object({
	type: z
		.enum([
			"passport",
			"drivers_license",
			"national_id",
			"postal_id",
			"voters_id",
			"senior_citizen_id",
			"company_id",
			"school_id",
		])
		.optional(),
	number: z.string().optional(),
	issuingCountry: z.string().optional(),
	expiryDate: z.coerce.date().optional(),
});

export const MetadataSchema = z.object({
	isActive: z.boolean(),
	status: z.string().optional(),
	createdBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	updatedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	lastLoginAt: z.coerce.date().optional(),
	isDeleted: z.boolean(),
});

export const PersonSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	personalInfo: PersonalInfoSchema.optional(),
	contactInfo: ContactInfoSchema,
	identification: IdentificationSchema.optional(),
	metadata: MetadataSchema.optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	isDeleted: z.boolean(),
});

export const CreatePersonSchema = PersonSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	organizationId: true,
	personalInfo: true,
	contactInfo: true,
	identification: true,
	metadata: true,
	isDeleted: true,
});

export const UpdatePersonSchema = PersonSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();
