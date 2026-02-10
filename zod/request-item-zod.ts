import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const DeliveryStatus = z.enum(["pending", "packed", "delivered", "partial"]);

// DeliveryItem Schema (full, including ID)
export const DeliveryItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),

	// Relations
	requestId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	deliveryReceiptId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(), // Required, fixed typo
	batchId: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid batch ID")
		.optional()
		.nullable(),
	productId: z.string().refine((val) => isValidObjectId(val)),

	// Quantities
	requestedQuantity: z.number().int().min(0),
	approvedQuantity: z.number().int().min(0).optional().nullable(),
	deliveredQuantity: z.number().int().min(0).optional().nullable(),

	// Notes and Status
	notes: z.string().optional().nullable(),
	itemStatus: DeliveryStatus.optional().nullable(), // Made optional to match Prisma

	// Tracking
	batchNumber: z.string().optional().nullable(),
	expiryDate: z.coerce.date().optional().nullable(),
	serialNumbers: z.array(z.string()).default([]),

	// Metadata
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type DeliveryItem = z.infer<typeof DeliveryItemSchema>;

// Create DeliveryItem Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateDeliveryItemSchema = DeliveryItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	requestId: true, // Added to partial since it's optional
	approvedQuantity: true,
	deliveredQuantity: true,
	notes: true,
	itemStatus: true,
	batchNumber: true,
	expiryDate: true,
	serialNumbers: true,
	isDeleted: true,
});

export type CreateDeliveryItem = z.infer<typeof CreateDeliveryItemSchema>;

// Update DeliveryItem Schema (partial, excluding immutable fields and relations)
export const UpdateDeliveryItemSchema = DeliveryItemSchema.omit({
	id: true,
	requestId: true,
	deliveryReceiptId: true, // Added since it's a relation
	productId: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateDeliveryItem = z.infer<typeof UpdateDeliveryItemSchema>;

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});
