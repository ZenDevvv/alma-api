import { z } from "zod";
import { isValidObjectId } from "mongoose";

// LogLevel Enum
export const LogLevel = z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]);

export type LogLevel = z.infer<typeof LogLevel>;

// LogStatus Enum
export const LogStatus = z.enum(["UNRESOLVED", "INVESTIGATING", "RESOLVED", "IGNORED"]);

export type LogStatus = z.infer<typeof LogStatus>;

// SystemLog Schema (full, including ID)
export const SystemLogSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	timestamp: z.coerce.date(),
	level: z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]),
	message: z.string().optional(),
	source: z.string().min(1),
	entity: z.string().optional(),
	entityType: z.string().optional(),
	entityId: z.string().optional(),
	requestId: z.string().optional(),
	sessionId: z.string().optional(),
	ipAddress: z.string().optional(),
	requestMethod: z.string().optional(),
	requestPath: z.string().optional(),
	requestBody: z.string().optional(),
	responseStatus: z.number().int().optional(),
	responseTime: z.number().int().optional(),
	errorCode: z.string().optional(),
	errorType: z.string().optional(),
	stackTrace: z.string().optional(),
	metadata: z.any().optional(),
	alertSent: z.boolean(),
	archived: z.boolean(),
	isDeleted: z.boolean(),
	archivedAt: z.coerce.date().optional(),
	expiresAt: z.coerce.date().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type SystemLog = z.infer<typeof SystemLogSchema>;

// Create SystemLog Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateSystemLogSchema = SystemLogSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	message: true,
	entity: true,
	entityType: true,
	entityId: true,
	requestId: true,
	sessionId: true,
	ipAddress: true,
	requestMethod: true,
	requestPath: true,
	requestBody: true,
	responseStatus: true,
	responseTime: true,
	errorCode: true,
	errorType: true,
	stackTrace: true,
	metadata: true,
	isDeleted: true,
	archivedAt: true,
	expiresAt: true,
});

export type CreateSystemLog = z.infer<typeof CreateSystemLogSchema>;

// Update SystemLog Schema (partial, excluding immutable fields and relations)
export const UpdateSystemLogSchema = SystemLogSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	archived: true,
	alertSent: true,
}).partial();

export type UpdateSystemLog = z.infer<typeof UpdateSystemLogSchema>;
