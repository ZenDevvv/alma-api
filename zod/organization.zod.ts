import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { PaginationSchema } from "./common.zod";

export const OrganizationSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	code: z.string().min(1),
	logo: z.string().optional(),
	background: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const GetAllOrganizationsSchema = z.object({
	organizations: z.array(OrganizationSchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllOrganizations = z.infer<typeof GetAllOrganizationsSchema>;

export const CreateOrganizationSchema = OrganizationSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	logo: true,
	background: true,
	isDeleted: true,
});

export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = OrganizationSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateOrganization = z.infer<typeof UpdateOrganizationSchema>;

export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});
