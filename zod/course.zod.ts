import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Course Status and Level enums matching Prisma schema
const CourseStatusEnum = z.enum(["draft", "pending_approval", "active", "archived"]);
const CourseLevelEnum = z.enum(["beginner", "intermediate", "advanced", "all_levels"]);

// Course Schema (full, including ID)
export const CourseSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	title: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	status: CourseStatusEnum,
	level: CourseLevelEnum,
	creditHours: z.number().optional(),
	thumbnail: z.string().optional(),
	syllabus: z.string().optional(),
	version: z.number().int(),
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
});

export type Course = z.infer<typeof CourseSchema>;

// Create Course Schema — omit auto-generated fields, mark optional fields as partial
export const CreateCourseSchema = CourseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	version: true,
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

// Update Course Schema — partial, exclude immutable fields and relations
export const UpdateCourseSchema = CourseSchema.omit({
	id: true,
	orgId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	createdBy: true,
}).partial();

export type UpdateCourse = z.infer<typeof UpdateCourseSchema>;
