import { z } from "zod";
import { isValidObjectId } from "mongoose";

export const DeliveryOrderItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), "Valid id is required"),
	productId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid productId is required")
		.optional(),
	asp: z.number().positive("ASP must be positive").optional(),
	expiryDate: z.coerce.date(),
	batchNumber: z.string().optional(),
	quantity: z.number().int("Quantity must be an integer").positive("Quantity must be positive"),
	notes: z.string().optional(),
	orderId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid orderId is required")
		.nullable()
		.optional(),
	batchId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid batchId is required")
		.nullable()
		.optional(),
	requestItemId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid requestItemId is required")
		.nullable()
		.optional(),
	supplierItemId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid supplierItemId is required")
		.nullable()
		.optional(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type DeliveryOrderItem = z.infer<typeof DeliveryOrderItemSchema>;

// Create DeliveryOrderItem Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateDeliveryOrderItemSchema = z.object({
	stockItemId: z.string().optional(),
	productId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid productId is required")
		.optional(),
	asp: z.number().positive("ASP must be positive").optional(),
	expiryDate: z.coerce.date().nullable().optional(),
	batchNumber: z.string().nullable().optional(),
	quantity: z.number().int("Quantity must be an integer").positive("Quantity must be positive"),
	notes: z.string().optional(),
	orderId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid orderId is required")
		.optional()
		.nullable(),
	batchId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid batchId is required")
		.optional()
		.nullable(),
	requestItemId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid requestItemId is required")
		.optional()
		.nullable(),
	supplierItemId: z
		.string()
		.refine((val) => isValidObjectId(val), "Valid supplierItemId is required")
		.optional()
		.nullable(),
	isDeleted: z.boolean().optional(),
});

export type CreateDeliveryOrderItem = z.infer<typeof CreateDeliveryOrderItemSchema>;

// Update DeliveryOrderItem Schema (partial, excluding immutable fields and relations)
export const UpdateDeliveryOrderItemSchema = z
	.object({
		productId: z
			.string()
			.refine((val) => isValidObjectId(val), "Valid productId is required")
			.optional(),
		asp: z.number().positive("ASP must be positive").optional(),
		batchNumber: z.string().optional(),
		quantity: z
			.number()
			.int("Quantity must be an integer")
			.positive("Quantity must be positive")
			.optional(),
		notes: z.string().optional(),
		batchId: z
			.string()
			.refine((val) => isValidObjectId(val), "Valid batchId is required")
			.optional()
			.nullable(),
		supplierItemId: z
			.string()
			.refine((val) => isValidObjectId(val), "Valid supplierItemId is required")
			.optional()
			.nullable(),
	})
	.partial();

export type UpdateDeliveryOrderItem = z.infer<typeof UpdateDeliveryOrderItemSchema>;
