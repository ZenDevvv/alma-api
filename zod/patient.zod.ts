import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Patient Schema (full, including ID)
export const PatientSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	userId: z.string().refine((val) => isValidObjectId(val)),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Patient = z.infer<typeof PatientSchema>;

// Create Patient Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreatePatientSchema = PatientSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	isDeleted: true,
});

export type CreatePatient = z.infer<typeof CreatePatientSchema>;

// Update Patient Schema (partial, excluding immutable fields and relations)
export const UpdatePatientSchema = PatientSchema.omit({
	id: true,
	userId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdatePatient = z.infer<typeof UpdatePatientSchema>;

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});
