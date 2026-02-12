import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { OrganizationSchema } from "./organization.zod";
import { CourseSchema } from "./course.zod";
import { ProgramSchema } from "./program.zod";

export const FacultyStatus = z.enum(["active", "archived"]);

export const FacultySchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	status: FacultyStatus.default("active"),

	orgId: z.string().refine((val) => isValidObjectId(val)),
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

	// --- Relation fields (from Prisma model) ---
	organization: OrganizationSchema.optional(),
	courses: z.array(CourseSchema).optional(),
	programs: z.array(ProgramSchema).optional(),
});

export type Faculty = z.infer<typeof FacultySchema>;

export const PaginationSchema = z.object({
	total: z.number(),
	page: z.number(),
	limit: z.number(),
	totalPages: z.number(),
	hasNext: z.boolean(),
	hasPrev: z.boolean(),
});

export const GetAllFacultiesSchema = z.object({
	faculties: z.array(FacultySchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllFaculties = z.infer<typeof GetAllFacultiesSchema>;

export const CreateFacultySchema = FacultySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	organization: true,
	courses: true,
	programs: true,
}).partial({
	description: true,
	status: true,
	isDeleted: true,
	createdBy: true,
	updatedBy: true,
});

export type CreateFaculty = z.infer<typeof CreateFacultySchema>;

export const UpdateFacultySchema = FacultySchema.omit({
	id: true,
	orgId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	createdBy: true,
	organization: true,
	courses: true,
	programs: true,
}).partial();

export type UpdateFaculty = z.infer<typeof UpdateFacultySchema>;
