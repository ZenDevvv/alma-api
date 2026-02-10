import { Request } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

/**
 * Logs audit events to the Audit Log microservice.
 */
export async function logAudit(
	req: Request,
	payload: {
		userId: string;
		action: string;
		resource: string;
		severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
		entityType: string;
		entityId: string;
		changesBefore: any | null;
		changesAfter: any | null;
		description: string;
		organizationId?: string;
	},
) {
	try {
		// Skip if userId is invalid (not a valid ObjectId)
		if (!payload.userId || payload.userId === "unknown" || payload.userId.length !== 24) {
			console.warn("Skipping audit log: invalid userId", payload.userId);
			return;
		}

		const xForwardedFor = req.headers["x-forwarded-for"];
		const forwardedIp = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
		const auditData = {
			userId: payload.userId,
			type: payload.action,
			severity: payload.severity,
			entity: {
				type: payload.entityType,
				id: payload.entityId,
			},
			changes: {
				before: payload.changesBefore,
				after: payload.changesAfter,
			},
			metadata: {
				userAgent: req.get("User-Agent") || "",
				ip: (req.ip || forwardedIp || req.socket.remoteAddress || "unknown") as string,
				path: req.originalUrl,
				method: req.method,
			},
			description: payload.description,
		};

		// Fire-and-forget logging
		prisma.auditLog
			.create({
				data: auditData,
			})
			.catch((err) => console.error("Audit log DB insert failed:", err.message));
	} catch (error: any) {
		console.error("Failed to log audit event:", error.message);
	}
}
