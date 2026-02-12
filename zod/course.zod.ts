
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { OrganizationSchema } from "./organization.zod";
import { FacultySchema } from "./faculty.zod";
import { ProgramSchema } from "./program.zod";
import { CategorySchema } from "./category.zod";

export const CourseStatus = z.enum(["draft", "pending_approval", "active", "archived"]);
export const CourseLevel = z.enum(["beginner", "intermediate", "advanced", "all_levels"]);

export const CourseSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	title: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	status: CourseStatus.default("draft"),
	level: CourseLevel.default("all_levels"),
	creditHours: z.number().optional(),
	thumbnail: z.string().optional(),
	syllabus: z.string().optional(),
	version: z.number().int(),

	// Foreign key IDs
	orgId: z.string().refine((val) => isValidObjectId(val)),
	facultyId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	programId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	categoryId: z
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

	// Relation fields (only where this model owns the foreign key)
	organization: OrganizationSchema.optional(),
	faculty: FacultySchema.optional(),
	program: ProgramSchema.optional(),
	category: CategorySchema.optional(),
});

export type Course = z.infer<typeof CourseSchema>;

export const PaginationSchema = z.object({
	total: z.number(),
	page: z.number(),
	limit: z.number(),
	totalPages: z.number(),
	hasNext: z.boolean(),
	hasPrev: z.boolean(),
});

export const GetAllCoursesSchema = z.object({
	courses: z.array(CourseSchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllCourses = z.infer<typeof GetAllCoursesSchema>;

export const CreateCourseSchema = CourseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	version: true,
	organization: true,
	faculty: true,
	program: true,
	category: true,
}).partial({
	description: true,
	status: true,
	level: true,
	creditHours: true,
	thumbnail: true,
	syllabus: true,
	facultyId: true,
	programId: true,
	categoryId: true,
	isDeleted: true,
	createdBy: true,
	updatedBy: true,
});

export type CreateCourse = z.infer<typeof CreateCourseSchema>;

export const UpdateCourseSchema = CourseSchema.omit({
	id: true,
	orgId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	createdBy: true,
	organization: true,
	faculty: true,
	program: true,
	category: true,
}).partial();

export type UpdateCourse = z.infer<typeof UpdateCourseSchema>;

export const AddPrerequisiteSchema = z.object({
	prerequisiteId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid prerequisite course ID format",
	}),
});

export type AddPrerequisite = z.infer<typeof AddPrerequisiteSchema>;
