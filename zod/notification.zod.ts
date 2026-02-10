import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Data Schema
export const DataSchema = z.object({
	user: z.string().refine((val) => isValidObjectId(val)),
	date: z.coerce.date(),
});

export type Data = z.infer<typeof DataSchema>;

// Recipients Schema
export const RecipientsSchema = z.object({
	read: z.array(DataSchema),
	unread: z.array(DataSchema),
});

export type Recipients = z.infer<typeof RecipientsSchema>;

// Notification Schema (full, including ID)
export const NotificationSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	source: z.string().min(1),
	category: z.string().min(1),
	title: z.string().min(1),
	description: z.string().min(1),
	departmentId: z.string().refine((val) => isValidObjectId(val)),
	recipients: RecipientsSchema.optional(),
	metadata: z.any().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// Create Notification Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateNotificationSchema = NotificationSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	recipients: true,
	metadata: true,
	isDeleted: true,
});

export type CreateNotification = z.infer<typeof CreateNotificationSchema>;

// Update Notification Schema (partial, excluding immutable fields and relations)
export const UpdateNotificationSchema = NotificationSchema.omit({
	id: true,
	departmentId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateNotification = z.infer<typeof UpdateNotificationSchema>;
