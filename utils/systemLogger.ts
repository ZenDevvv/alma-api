import { Request } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

/**
 * Logs system events to the System Log microservice.
 */
export async function logSystemEvent(
	req: Request,
	payload: {
		level: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
		message?: string;
		source: string;
		entity?: string;
		entityType?: string;
		entityId?: string;
		requestId?: string;
		sessionId?: string;
		requestMethod?: string;
		requestPath?: string;
		requestBody?: string;
		responseStatus?: number;
		responseTime?: number;
		errorCode?: string;
		errorType?: string;
		stackTrace?: string;
		metadata?: any;
		alertSent?: boolean;
		archived?: boolean;
		expiresAt?: Date;
	},
) {
	try {
		const xForwardedFor = req.headers["x-forwarded-for"];
		const forwardedIp = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;

		const systemLogData = {
			level: payload.level,
			message: payload.message,
			source: payload.source,
			entity: payload.entity,
			entityType: payload.entityType,
			entityId: payload.entityId,
			requestId: payload.requestId,
			sessionId: payload.sessionId,
			ipAddress: (req.ip || forwardedIp || req.socket.remoteAddress || "unknown") as string,
			requestMethod: payload.requestMethod || req.method,
			requestPath: payload.requestPath || req.originalUrl,
			requestBody: payload.requestBody,
			responseStatus: payload.responseStatus,
			responseTime: payload.responseTime,
			errorCode: payload.errorCode,
			errorType: payload.errorType,
			stackTrace: payload.stackTrace,
			metadata: payload.metadata,
			alertSent: payload.alertSent || false,
			archived: payload.archived || false,
			expiresAt: payload.expiresAt,
		};

		// Fire-and-forget logging
		prisma.systemLog
			.create({
				data: systemLogData,
			})
			.catch((err) => console.error("System log DB insert failed:", err.message));
	} catch (error: any) {
		console.error("Failed to log system event:", error.message);
	}
}
