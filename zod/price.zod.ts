import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Price Schema (full, including ID)
export const PriceSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid MongoDB ObjectId",
	}),
	unitPrice: z.number().positive("Unit price must be positive"),

	requestedTotalPrice: z.number().nonnegative("Requested total price must be non-negative"),
	approvedTotalPrice: z.number().nonnegative("Approved total price must be non-negative"),
	deliveredTotalPrice: z.number().nonnegative("Delivered total price must be non-negative"),

	productName: z.string().optional().nullable(),
	description: z.string().optional().nullable(),

	asp: z.number().nonnegative("ASP must be non-negative"),
	srp: z.number().nonnegative("SRP must be non-negative"),

	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Price = z.infer<typeof PriceSchema>;

// Create Price Schema (excluding ID, createdAt, updatedAt, isDeleted)
export const CreatePriceSchema = z.object({
	unitPrice: z.number().positive("Unit price must be positive"),

	requestedTotalPrice: z.number().nonnegative("Requested total price must be non-negative"),
	approvedTotalPrice: z.number().nonnegative("Approved total price must be non-negative"),
	deliveredTotalPrice: z.number().nonnegative("Delivered total price must be non-negative"),

	productName: z.string().optional().nullable(),
	description: z.string().optional().nullable(),

	asp: z.number().nonnegative("ASP must be non-negative"),
	srp: z.number().nonnegative("SRP must be non-negative"),
});

export type CreatePrice = z.infer<typeof CreatePriceSchema>;

// Update Price Schema (partial, excluding immutable fields)
export const UpdatePriceSchema = z
	.object({
		unitPrice: z.number().positive("Unit price must be positive").optional(),

		requestedTotalPrice: z
			.number()
			.nonnegative("Requested total price must be non-negative")
			.optional(),
		approvedTotalPrice: z
			.number()
			.nonnegative("Approved total price must be non-negative")
			.optional(),
		deliveredTotalPrice: z
			.number()
			.nonnegative("Delivered total price must be non-negative")
			.optional(),

		productName: z.string().optional().nullable(),
		description: z.string().optional().nullable(),

		asp: z.number().nonnegative("ASP must be non-negative").optional(),
		srp: z.number().nonnegative("SRP must be non-negative").optional(),
	})
	.partial();

export type UpdatePrice = z.infer<typeof UpdatePriceSchema>;

// Query/Filter Schema
export const QueryPriceSchema = z.object({
	groupBy: z.string().optional(),
});

export type QueryPrice = z.infer<typeof QueryPriceSchema>;
