import { z } from "zod";
import { isValidObjectId } from "mongoose";

// ============ ENUMS ============
export const StatusEnum = z.enum(["active", "inactive", "discontinued", "critical"]);

export const UnitOfMeasureEnum = z.enum([
	"piece",
	"tablet",
	"capsule",
	"box",
	"bottle",
	"vial",
	"pack",
	"tube",
	"strip",
	"carton",
	"bag",
	"unit",
]);
// ============ FULL PRODUCT SCHEMA ============
export const ProductSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), "Invalid MongoDB ID"),
	name: z.string().min(1, "Product name is required"),
	description: z.string().optional().nullable(),
	gtin: z.string().optional().nullable(),
	sku: z.string().optional().nullable(),
	unitOfMeasure: UnitOfMeasureEnum,
	quantityPerBox: z.number().int().positive().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	status: StatusEnum,
	categoryId: z.string().refine((val) => isValidObjectId(val), "Invalid category ID"),
	productTypeId: z.string().refine((val) => isValidObjectId(val), "Invalid category ID"),
	requiresPrescription: z.boolean().default(false),
	storageRequirement: z.string().min(1, "Storage requirement is required"),
	reorderLevel: z.number().int().positive("Reorder level must be positive").max(100),
	maxStockLevel: z.number().int().positive("Max stock level must be positive"),
	supplierItemId: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid supplier item ID")
		.optional()
		.nullable(),
	asp: z.number().positive(),
	isDeleted: z.boolean().default(false),
});

export type Product = z.infer<typeof ProductSchema>;

// ============ CREATE PRODUCT SCHEMA ============
export const CreateProductSchema = z.object({
	name: z.string().min(1, "Product name is required"),
	description: z.string().optional().nullable(),
	gtin: z.string().optional().nullable(),
	sku: z.string().optional().nullable(),
	unitOfMeasure: UnitOfMeasureEnum,
	quantityPerBox: z.number().int().positive().optional().nullable(),
	status: StatusEnum,
	categoryId: z.string().refine((val) => isValidObjectId(val), "Invalid category ID"),
	productTypeId: z.string().refine((val) => isValidObjectId(val), "Invalid productType ID"),
	requiresPrescription: z.boolean().default(false),
	storageRequirement: z.string().min(1, "Storage requirement is required"),
	reorderLevel: z.number().int().positive("Reorder level must be positive"),
	maxStockLevel: z.number().int().positive("Max stock level must be positive"),
	supplierItemId: z
		.string()
		.refine((val) => isValidObjectId(val), "Invalid supplier item ID")
		.optional()
		.nullable(),
	srp: z.number().positive(),
});

export type CreateProduct = z.infer<typeof CreateProductSchema>;

// ============ UPDATE PRODUCT SCHEMA ============
export const UpdateProductSchema = z
	.object({
		name: z.string().min(1).optional(),
		description: z.string().optional().nullable(),
		gtin: z.string().optional().nullable(),
		sku: z.string().optional().nullable(),
		unitOfMeasure: UnitOfMeasureEnum.optional(),
		srp: z.number().positive(),
		quantityPerBox: z.number().int().positive().optional().nullable(),
		status: StatusEnum.optional(),
		categoryId: z
			.string()
			.refine((val) => isValidObjectId(val), "Invalid category ID")
			.optional(),
		productTypeId: z
			.string()
			.refine((val) => isValidObjectId(val), "Invalid Product Type ID")
			.optional(),
		requiresPrescription: z.boolean().optional(),
		storageRequirement: z.string().min(1, "Storage requirement is required").optional(),
		reorderLevel: z.number().int().positive().optional(),
		maxStockLevel: z.number().int().positive().optional(),
		supplierItemId: z
			.string()
			.refine((val) => isValidObjectId(val), "Invalid supplier item ID")
			.optional()
			.nullable(),
	})
	.strict(); // strict mode to prevent extra fields

export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
