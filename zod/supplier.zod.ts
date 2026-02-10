import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Address Schema (for nested JSON validation)
export const AddressSchema = z
	.object({
		street: z.string().optional(),
		city: z.string().optional(),
		state: z.string().optional(),
		postalCode: z.string().optional(),
		country: z.string().optional(),
	})
	.optional();

// Supplier Product Schema (for embedded products array)
export const SupplierProductSchema = z.object({
	productId: z.string().refine((val) => isValidObjectId(val)),
	productName: z.string().optional(),
	supplierSku: z.string().optional(),
	leadTimeDays: z.number().int().positive().optional(),
	minOrderQuantity: z.number().int().positive().optional(),
	unitPrice: z.number().positive().optional(),
});

// Supplier Schema (full, including ID)
export const SupplierSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	code: z.string().min(1),
	name: z.string().min(1),
	contactPerson: z.string().optional(),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	address: AddressSchema,
	gln: z.string().optional(),
	paymentTerms: z.string().optional(),
	isActive: z.boolean().default(true),
	rating: z.number().min(0).max(5).optional(),
	products: z.array(SupplierProductSchema).default([]),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Supplier = z.infer<typeof SupplierSchema>;

// Create Supplier Schema (excluding ID, createdAt, updatedAt)
export const CreateSupplierSchema = SupplierSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	contactPerson: true,
	email: true,
	phone: true,
	address: true,
	gln: true,
	paymentTerms: true,
	isActive: true,
	rating: true,
	products: true,
});

export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

// Update Supplier Schema (partial, excluding immutable fields)
export const UpdateSupplierSchema = SupplierSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;
