import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { CreateDeliveryOrderItemSchema, DeliveryOrderItemSchema } from "./order-item-zod";

// Custom ObjectId validator
const objectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId format",
});

// Enums
export const OrderStatusSchema = z.enum(["in_transit", "delivered"]);

export const OrderTypeSchema = z.enum(["with_request", "without_request"]);

export const SourceTypeSchema = z.enum(["department", "supplier"]);

// Main Delivery Order Schema
export const DeliveryOrderSchema = z.object({
	id: objectIdSchema.optional(),

	// Order Details
	departmentId: objectIdSchema.optional().nullable(),
	type: OrderTypeSchema.default("with_request"),

	// Related Request
	deliveryRequestId: objectIdSchema.optional().nullable(),

	// Source and Destination Information
	sourceId: objectIdSchema,
	sourceType: SourceTypeSchema,
	destinationId: objectIdSchema, // Added this field

	// Status
	status: OrderStatusSchema.default("in_transit"),

	// Dates
	requiredByDate: z.coerce.date().optional().nullable(),
	expectedDeliveryDate: z.coerce.date().optional().nullable(),
	actualDeliveryDate: z.coerce.date().optional().nullable(),

	// Additional Information
	purpose: z.string().optional().nullable(),
	notes: z.string().optional().nullable(),
	specialInstructions: z.string().optional().nullable(),
	rejectionReason: z.string().optional().nullable(),

	// Items
	items: z.array(DeliveryOrderItemSchema).min(1, "At least one item is required"),

	// Preparation
	preparedById: objectIdSchema.optional().nullable(),
	preparedAt: z.coerce.date().optional().nullable(),

	// Dispatch
	dispatchedById: objectIdSchema.optional().nullable(),
	dispatchedAt: z.coerce.date().optional().nullable(),

	// System Fields
	isActive: z.boolean().default(true),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});

// Create Delivery Order Schema (for POST requests)
export const CreateDeliveryOrderSchema = DeliveryOrderSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.extend({
		// Override items with CreateDeliveryOrderItemSchema
		departmentId: objectIdSchema.optional().nullable(),
		items: z.array(CreateDeliveryOrderItemSchema).min(1, "At least one item is required"),
	})
	.refine(
		(data) => {
			// For department-to-department transfers, source and destination must be different
			if (data.sourceType === "department") {
				return data.sourceId !== data.destinationId;
			}
			return true;
		},
		{
			message: "Source and destination departments cannot be the same",
			path: ["destinationId"],
		},
	);

// Update Delivery Order Schema (for PUT/PATCH requests)
export const UpdateDeliveryOrderSchema = DeliveryOrderSchema.partial().omit({
	id: true,
	createdAt: true,
});

// Query/Filter Schema
export const DeliveryOrderFilterSchema = z.object({
	status: OrderStatusSchema.optional(),
	type: OrderTypeSchema.optional(),
	sourceType: SourceTypeSchema.optional(),
	sourceId: objectIdSchema.optional(),
	destinationId: objectIdSchema.optional(), // Added for filtering
	year: z.number().int().optional(),
	isActive: z.boolean().optional(),
	isDeleted: z.boolean().optional(),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
});

// Type exports
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderType = z.infer<typeof OrderTypeSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type OrderItem = z.infer<typeof DeliveryOrderItemSchema>;
export type DeliveryOrder = z.infer<typeof DeliveryOrderSchema>;
export type CreateDeliveryOrder = z.infer<typeof CreateDeliveryOrderSchema>;
export type UpdateDeliveryOrder = z.infer<typeof UpdateDeliveryOrderSchema>;
export type DeliveryOrderFilter = z.infer<typeof DeliveryOrderFilterSchema>;
