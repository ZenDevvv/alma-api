import { z } from "zod";
import { isValidObjectId } from "mongoose";

// TransactionItem Schema (full, including ID)
export const TransactionItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), "Invalid ObjectId"),
	transactionId: z.string().refine((val) => isValidObjectId(val), "Invalid ObjectId"),
	productId: z.string().refine((val) => isValidObjectId(val), "Invalid ObjectId"),
	batchNumber: z.string(),
	expiryDate: z.coerce.date(),
	quantity: z.number().int().positive("Quantity must be positive"),
	stockAfter: z.number().int().nonnegative("Stock after must be non-negative"),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type TransactionItem = z.infer<typeof TransactionItemSchema>;

// Create TransactionItem Schema (excluding ID, createdAt, updatedAt, and default fields)
export const CreateTransactionItemSchema = TransactionItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	isDeleted: true,
});

export type CreateTransactionItem = z.infer<typeof CreateTransactionItemSchema>;

// Update TransactionItem Schema (partial, excluding immutable fields)
export const UpdateTransactionItemSchema = TransactionItemSchema.omit({
	id: true,
	transactionId: true, // Usually you don't change the parent transaction
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateTransactionItem = z.infer<typeof UpdateTransactionItemSchema>;

// Group By Schema
export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});
