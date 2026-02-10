import { Response, NextFunction } from "express";

import { AuthRequest } from "./verifyToken";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

/**
 * Middleware to check if the authenticated user is assigned to the approval
 * Usage: routes.patch("/:id", checkApprovalAssignment, controller.update);
 */
export const checkApprovalAssignment = async (
	req: AuthRequest,
	res: Response,
	next: NextFunction,
) => {
	try {
		const approvalId = req.params.id;
		const userId = req.userId;

		if (!userId) {
			return res.status(401).json({
				success: false,
				message: "Authentication required",
			});
		}

		// TODO: Approval model not yet defined in Prisma schema — cast to any until model is added
		const approval = await (prisma as any).approval.findFirst({
			where: {
				id: approvalId,
				isDeleted: false,
			},
			include: {
				userApprovals: {
					where: {
						userId: userId,
					},
				},
			},
		});

		if (!approval) {
			return res.status(404).json({
				success: false,
				message: "Approval not found",
			});
		}

		if (approval.userApprovals.length === 0) {
			return res.status(403).json({
				success: false,
				message:
					"You are not authorized to update this approval. Only assigned approvers can perform this operation.",
			});
		}

		next();
	} catch (error) {
		console.error("Error in checkApprovalAssignment middleware:", error);
		return res.status(500).json({
			success: false,
			message: "Internal server error while checking approval assignment",
		});
	}
};
