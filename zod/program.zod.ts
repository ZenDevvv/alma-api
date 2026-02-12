import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { OrganizationSchema } from "./organization.zod";
import { CourseSchema } from "./course.zod";

export const ProgramStatus = z.enum(["active", "archived"]);

export const ProgramSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	status: ProgramStatus.default("active"),
	totalUnits: z.number().int().optional(),
	requirements: z.unknown().optional(),
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

	// --- Relation fields (from Prisma model) ---
	organization: OrganizationSchema.optional(),
	courses: z.array(CourseSchema).optional(),
});

export type Program = z.infer<typeof ProgramSchema>;

export const CreateProgramSchema = ProgramSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	organization: true,
	courses: true,
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
	courses: true,
}).partial();

export type UpdateProgram = z.infer<typeof UpdateProgramSchema>;
