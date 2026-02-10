import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Page Schema
export const PageSchema = z.object({
	url: z.string().min(1),
	title: z.string().min(1),
});

export const HeadersSchema = z.object({
	userAgent: z.string().min(1),
});

export const ArchiveSchema = z.object({
	status: z.boolean(),
	date: z.coerce.date(),
});

export const ActivityLogSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	userId: z.string().refine((val) => isValidObjectId(val)),
	headers: HeadersSchema.optional(),
	ip: z.string().min(1),
	path: z.string().min(1),
	method: z.string().min(1),
	page: PageSchema.optional(),
	action: z.string().min(1),
	description: z.string().min(1),
	organizationId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	entityType: z.string().optional(),
	archive: ArchiveSchema.optional(),
	isDeleted: z.boolean().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export const CreateActivityLogSchema = ActivityLogSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	headers: true,
	page: true,
	organizationId: true,
	entityType: true,
	archive: true,
	isDeleted: true,
});

export const UpdateActivityLogSchema = z.object({
	userId: z
		.string()
		.min(1)
		.refine((val) => isValidObjectId(val))
		.optional(),
	headers: HeadersSchema.optional(),
	ip: z.string().min(1).optional(),
	path: z.string().min(1).optional(),
	method: z.string().min(1).optional(),
	page: PageSchema.optional(),
	action: z.string().min(1).optional(),
	description: z.string().min(1).optional(),
	organizationId: z
		.string()
		.min(1)
		.refine((val) => isValidObjectId(val))
		.optional(),
	entityType: z.string().min(1).optional(),
	archive: ArchiveSchema.optional(),
});
