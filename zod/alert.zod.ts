import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Enums
export const AlertSeverity = z.enum(["critical", "warning", "low_stock"]);
export type AlertSeverity = z.infer<typeof AlertSeverity>;

export const AlertType = z.enum(["stock_critical", "expiry_warning", "low_stock", "other"]);
export type AlertType = z.infer<typeof AlertType>;

// Full Alert Schema (including ID and timestamps)
export const AlertSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), "Invalid MongoDB ObjectId"),
	productName: z.string().min(1, "Product name is required"),
	dosage: z.string().optional(),
	severity: AlertSeverity,
	alertType: AlertType,
	message: z.string().optional(),

	// Product Details
	sku: z.string().min(1, "SKU is required"),
	batch: z.string().optional(),
	batchId: z.string().optional(),
	currentStock: z.number().int().nonnegative().optional(),
	minRequired: z.number().int().nonnegative().optional(),
	expiryDate: z.coerce.date().optional(),

	// Metadata
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	resolvedAt: z.coerce.date().optional(),
	isResolved: z.boolean().default(false),

	// Relationships
	userId: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid userId")
		.optional(),

	// Additional fields
	actionTaken: z.string().optional(),
	notes: z.string().optional(),
});

export type Alert = z.infer<typeof AlertSchema>;

// Create Alert Schema (excluding ID, createdAt, updatedAt)
export const CreateAlertSchema = AlertSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	resolvedAt: true,
}).partial({
	dosage: true,
	message: true,
	batch: true,
	batchId: true,
	currentStock: true,
	minRequired: true,
	expiryDate: true,
	userId: true,
	actionTaken: true,
	notes: true,
	isResolved: true,
});

export type CreateAlert = z.infer<typeof CreateAlertSchema>;

// Update Alert Schema (partial, excluding immutable fields)
export const UpdateAlertSchema = AlertSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateAlert = z.infer<typeof UpdateAlertSchema>;

// Resolve Alert Schema (mark as resolved with optional action)
export const ResolveAlertSchema = z.object({
	actionTaken: z.string().optional(),
	notes: z.string().optional(),
});

export type ResolveAlert = z.infer<typeof ResolveAlertSchema>;

// Filter/Query Schema
export const AlertFilterSchema = z.object({
	severity: AlertSeverity.optional(),
	alertType: AlertType.optional(),
	isResolved: z.boolean().optional(),
	sku: z.string().optional(),
	productName: z.string().optional(),
	organizationId: z.string().optional(),
	userId: z.string().optional(),
	dateFrom: z.coerce.date().optional(),
	dateTo: z.coerce.date().optional(),
});

export type AlertFilter = z.infer<typeof AlertFilterSchema>;

// Pagination Schema
export const PaginationSchema = z.object({
	page: z.number().int().positive().default(1),
	limit: z.number().int().positive().default(10),
	sortBy: z.enum(["createdAt", "severity", "productName"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type Pagination = z.infer<typeof PaginationSchema>;

// Group By Schema
export const GroupBySchema = z.object({
	groupBy: z.enum(["severity", "alertType", "productName", "sku"]).optional(),
});

export type GroupBy = z.infer<typeof GroupBySchema>;
