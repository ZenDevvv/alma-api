import { z } from "zod";
import { isValidObjectId } from "mongoose";

const objectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId format",
});

const StockStatusEnum = z.enum([
	"in_stock",
	"low_stock",
	"out_of_stock",
	"expired",
	"near_expiry",
	"damaged",
	"quarantined",
]);

// ------------------ Base full schema (single source of truth) ------------------
const StockRecordSchema = z.object({
	id: objectIdSchema,
	departmentId: objectIdSchema,
	productId: objectIdSchema,
	totalStock: z.number().int().min(0, "Total stock cannot be negative"),
	status: StockStatusEnum,
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type StockRecord = z.infer<typeof StockRecordSchema>;

// ------------------ Create: omit auto-generated fields ------------------
export const CreateStockRecordSchema = StockRecordSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).extend({
	// Ensure these are required on create (they already are in base, but being explicit)
	departmentId: objectIdSchema,
	productId: objectIdSchema,
	totalStock: z.number().int().min(0, "Total stock cannot be negative"),
	status: StockStatusEnum,
	isDeleted: z.boolean().optional().default(false),
});

export type CreateStockRecord = z.infer<typeof CreateStockRecordSchema>;

// ------------------ Update (PUT): replace entire object, same as create but optional id ------------------
export const UpdateStockRecordSchema = StockRecordSchema.omit({
	createdAt: true,
	updatedAt: true,
}).extend({
	id: objectIdSchema.optional(), // usually provided in URL, but allowed in body if needed
});

export type UpdateStockRecord = z.infer<typeof UpdateStockRecordSchema>;

// ------------------ Patch (PATCH): partial update, at least one field ------------------
export const PatchStockRecordSchema = StockRecordSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.partial()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided for update",
	});

export type PatchStockRecord = z.infer<typeof PatchStockRecordSchema>;

// zod/stock-record.zod.ts
export const AdjustStockQuantitySchema = z.object({
	departmentId: objectIdSchema,
	productId: objectIdSchema,
	quantity: z.number().int().positive("Quantity must be a positive number"),
	operation: z.enum(["in", "out"]),
});

export type AdjustStockQuantity = z.infer<typeof AdjustStockQuantitySchema>;
