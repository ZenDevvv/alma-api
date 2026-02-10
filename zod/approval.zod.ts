import { z } from "zod";
import { isValidObjectId } from "mongoose";

// Approval Status Enum
export const ApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

// User Approval Schema (for the join table)
export const UserApprovalSchema = z.object({
	userId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format for userId",
	}),
	role: z.string().optional(), // e.g., "primary_approver", "secondary_approver"
	order: z.number().int().positive().optional(), // Order of approval if sequential
});

export type UserApproval = z.infer<typeof UserApprovalSchema>;

// Approval Schema (full, including ID)
export const ApprovalSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format",
	}),
	requestId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid ObjectId format for requestId",
	}),
	status: ApprovalStatusSchema,
	comments: z.string().nullable(),
	level: z.number().int().positive({
		message: "Level must be a positive integer",
	}),
	approvedAt: z.coerce.date().nullable(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Approval = z.infer<typeof ApprovalSchema>;

// Create Approval Schema (excluding ID, createdAt, updatedAt, and auto-generated fields)
export const CreateApprovalSchema = ApprovalSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	approvedAt: true,
	isDeleted: true,
})
	.extend({
		approvers: z
			.array(UserApprovalSchema)
			.min(1, { message: "At least one approver is required" }),
	})
	.partial({
		comments: true,
		status: true,
	});

export type CreateApproval = z.infer<typeof CreateApprovalSchema>;

// Update Approval Schema (partial, excluding immutable fields)
export const UpdateApprovalSchema = ApprovalSchema.omit({
	id: true,
	requestId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
})
	.extend({
		approvers: z.array(UserApprovalSchema).optional(),
	})
	.partial();

export type UpdateApproval = z.infer<typeof UpdateApprovalSchema>;

// Group By Schema
export const GroupBySchema = z.object({
	groupBy: z.string().optional(),
});
