import { z } from "zod";

// Base schema with all fields matching Prisma model
export const BatchSchema = z.object({
	id: z.string(),
	departmentId: z.string(), // ObjectId reference - required
	batchNumber: z.string().min(1, "Batch number is required"),
	receivedAt: z.date(),
	receivedById: z.string().nullable().optional(), // ObjectId reference
	date: z.date().nullable().optional(),
	orgId: z.string().nullable().optional(),
	isDeleted: z.boolean(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

// For creating a new batch (without auto-generated fields)
export const CreateBatchSchema = BatchSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true, // Typically has default value
}).extend({
	receivedAt: z.date().optional(), // Has default(now()) in Prisma
});

// For updating an existing batch
export const UpdateBatchSchema = z.object({
	departmentId: z.string().optional(),
	batchNumber: z.string().min(1, "Batch number is required").optional(),
	receivedAt: z.date().optional(),
	receivedById: z.string().nullable().optional(),
	date: z.date().nullable().optional(),
	isDeleted: z.boolean().optional(),
});

// Type exports
export type Batch = z.infer<typeof BatchSchema>;
export type CreateBatch = z.infer<typeof CreateBatchSchema>;
export type UpdateBatch = z.infer<typeof UpdateBatchSchema>;
