import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Metrics Schema (full, including ID)
export const MetricsSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Metrics = z.infer<typeof MetricsSchema>;

// Create Metrics Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateMetricsSchema = MetricsSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateTemplate = z.infer<typeof CreateMetricsSchema>;

// Update Metrics Schema (partial, excluding immutable fields and relations)
export const UpdateMetricsSchema = MetricsSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});

export type UpdateTemplate = z.infer<typeof UpdateMetricsSchema>;

// Schema for metrics collection endpoint - Single model per request
export const CollectMetricsSchema = z.object({
	model: z.string().min(1, "Model name is required"),
	data: z.array(z.string()).min(1, "At least one data type is required"),
	filter: z
		.object({
			dateFrom: z.coerce.date().optional(),
			dateTo: z.coerce.date().optional(),
		})
		.passthrough() // Allow additional filter properties
		.optional(),
});

export type CollectMetrics = z.infer<typeof CollectMetricsSchema>;
