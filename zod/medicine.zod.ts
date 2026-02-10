import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Full Medicine schema (as returned from DB, including virtuals/relations if populated)
export const MedicineSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId",
	}),
	patientId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid patientId ObjectId",
	}),
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid productId ObjectId",
	}),
	quantity: z.number().int().positive("Quantity must be a positive integer"),
	prescription: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	// Optional populated relations (only present if you use `include` in Prisma)
	patient: z.any().optional(),
	product: z.any().optional(),
});

export type Medicine = z.infer<typeof MedicineSchema>;

// Create Medicine – what the client can send when creating a new record
export const CreateMedicineSchema = z.object({
	patientId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid patientId",
	}),
	productId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid productId",
	}),
	quantity: z.number().int().positive("Quantity must be a positive integer"),
	prescription: z.boolean().optional(), // defaults to false in Prisma
});

export type CreateMedicineInput = z.infer<typeof CreateMedicineSchema>;

// Update Medicine;

// Update Medicine – partial update, no immutable fields
export const UpdateMedicineSchema = z.object({
	quantity: z.number().int().positive().optional(),
	prescription: z.boolean().optional(),
	// You usually don't allow changing relations after creation,
	// but if your use-case requires it:
	// patientId: z.string().refine(isValidObjectId).optional(),
	// productId: z.string().refine(isValidObjectId).optional(),
});

export type UpdateMedicineInput = z.infer<typeof UpdateMedicineSchema>;

// Optional: Query params (e.g. for filtering or grouping)
export const MedicineQuerySchema = z.object({
	patientId: z.string().optional(),
	productId: z.string().optional(),
	prescription: z.boolean().optional(),
	isDeleted: z.boolean().optional(),
	page: z.coerce.number().int().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type MedicineQuery = z.infer<typeof MedicineQuerySchema>;
