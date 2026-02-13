import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { OrganizationSchema } from "./organization.zod";
import { FacultySchema } from "./faculty.zod";
import { PaginationSchema } from "./common.zod";

export const ProgramStatus = z.enum(["active", "archived"]);

export const ProgramSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	status: ProgramStatus.default("active"),
	totalUnits: z.number().int().optional(),
	requirements: z.unknown().optional(),
	// --- Foreign key IDs ---
	orgId: z.string().refine((val) => isValidObjectId(val)),
	facultyId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),

	isDeleted: z.boolean(),
	createdBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	updatedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	// --- Relation fields (only where this model owns the foreign key) ---
	organization: OrganizationSchema.optional(),
	faculty: FacultySchema.optional(),
});

export type Program = z.infer<typeof ProgramSchema>;

export const GetAllProgramsSchema = z.object({
	programs: z.array(ProgramSchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllPrograms = z.infer<typeof GetAllProgramsSchema>;

export const CreateProgramSchema = ProgramSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	organization: true,
	faculty: true,
}).partial({
	description: true,
	status: true,
	totalUnits: true,
	requirements: true,
	facultyId: true,
	isDeleted: true,
	createdBy: true,
	updatedBy: true,
});

export type CreateProgram = z.infer<typeof CreateProgramSchema>;

export const UpdateProgramSchema = ProgramSchema.omit({
	id: true,
	orgId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	createdBy: true,
	organization: true,
	faculty: true,
}).partial();

export type UpdateProgram = z.infer<typeof UpdateProgramSchema>;
