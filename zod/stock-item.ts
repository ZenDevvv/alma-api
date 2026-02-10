import { z } from "zod";

// Base schema for StockMovementItem
export const StockMovementItemSchema = z.object({
	id: z.string(),
	inventoryRecordId: z.string(),
	productId: z.string(),
	lotId: z.string().nullable().optional(),
	quantity: z.number().int(),
	unitCost: z.number().nullable().optional(),
	totalCost: z.number().nullable().optional(),
	fromLocationId: z.string().nullable().optional(),
	toLocationId: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	isDeleted: z.boolean().default(false),
	createdAt: z.date(),
	updatedAt: z.date(),
});

// Schema for creating a new StockMovementItem (excludes auto-generated fields)
export const CreateStockMovementItemSchema = z.object({
	inventoryRecordId: z.string(),
	productId: z.string(),
	lotId: z.string().nullable().optional(),
	quantity: z.number().int().positive("Quantity must be positive"),
	unitCost: z.number().nonnegative().nullable().optional(),
	totalCost: z.number().nonnegative().nullable().optional(),
	fromLocationId: z.string().nullable().optional(),
	toLocationId: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	isDeleted: z.boolean().optional().default(false),
});

// Schema for updating a StockMovementItem (all fields optional except id)
export const UpdateStockMovementItemSchema = z.object({
	id: z.string(),
	inventoryRecordId: z.string().optional(),
	productId: z.string().optional(),
	lotId: z.string().nullable().optional(),
	quantity: z.number().int().positive().optional(),
	unitCost: z.number().nonnegative().nullable().optional(),
	totalCost: z.number().nonnegative().nullable().optional(),
	fromLocationId: z.string().nullable().optional(),
	toLocationId: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	isDeleted: z.boolean().optional(),
});

// Type exports
export type StockMovementItem = z.infer<typeof StockMovementItemSchema>;
export type CreateStockMovementItem = z.infer<typeof CreateStockMovementItemSchema>;
export type UpdateStockMovementItem = z.infer<typeof UpdateStockMovementItemSchema>;
