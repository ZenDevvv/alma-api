import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Transaction Type enum
export const TransactionTypeSchema = z.enum(["in", "out", "adjustment"]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export const SourceTypeSchema = z.enum(["department", "supplier"]);


export const TransactionSchema = z.object({
	id: z.string().refine(isValidObjectId),
	transactionNumber: z.string().min(1),
	referenceId: z.string().refine(isValidObjectId),
	sequence: z.number().int(),
	year: z.number().int(),
	type: TransactionTypeSchema,
	performedById: z.string().refine(isValidObjectId),
	sourceId: z.string().refine(isValidObjectId),
	sourceType: SourceTypeSchema,
	destinationId: z.string().refine(isValidObjectId),
	performedAt: z.coerce.date(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransactionSchema = TransactionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	transactionNumber: true,
	sequence: true,
	year: true,
}).partial({
	isDeleted: true, // allowed optional
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;

export const UpdateTransactionSchema = TransactionSchema.omit({
	id: true,
	transactionNumber: true,
	referenceId: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateTransaction = z.infer<typeof UpdateTransactionSchema>;
