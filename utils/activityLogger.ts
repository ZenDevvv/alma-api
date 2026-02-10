import { Request } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

/**
 * Logs user activity to the Activity Log microservice.
 */
export async function logActivity(
	req: Request,
	payload: {
		userId: string;
		action: string;
		description: string;
		departmentId?: string;
		page?: { url: string; title: string };
	},
) {
	try {
		// Skip if userId is invalid (not a valid ObjectId)
		if (!payload.userId || payload.userId === "unknown" || payload.userId.length !== 24) {
			console.warn("Skipping activity log: invalid userId", payload.userId);
			return;
		}

		const xForwardedFor = req.headers["x-forwarded-for"];
		const forwardedIp = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
		const userAgent = req.get("User-Agent");

		const activityData = {
			userId: payload.userId,
			ip: (req.ip || forwardedIp || req.socket.remoteAddress || "unknown") as string,
			path: req.originalUrl,
			method: req.method,
			headers: userAgent ? { userAgent } : undefined,
			action: payload.action,
			page: payload.page,
			description: payload.description,
			departmentId: payload.departmentId,
		};

		// Fire-and-forget logging
		prisma.activityLog
			.create({
				data: activityData,
			})
			.catch((err) => console.error("Activity log DB insert failed:", err.message));
	} catch (error: any) {
		console.error("Failed to log activity:", error.message);
	}
}
