import { Request } from "express";
import { PrismaClient } from "../generated/prisma";
import { getUsersByRole, getUsersByRoleAndDepartment } from "../helper/roleHelper";

const prisma = new PrismaClient();

export async function getRecipients(role: string) {
	const users = await getUsersByRole(role as "user" | "admin" | "viewer");
	return users.map((user) => user.id);
}

/**
 * Logs notifications to the Notification microservice.
 */
export async function logNotification(
	req: Request,
	payload: {
		role: string;
		source: string;
		category: string;
		title: string;
		description: string;
		departmentId: string;
		recipients?: {
			read: Array<{ user: string; date: Date }>;
			unread: Array<{ user: string; date: Date }>;
		};
		metadata?: any;
	},
) {
	try {
		// Validate departmentId is a valid ObjectId (24 hex chars)
		if (!payload.departmentId || payload.departmentId.length !== 24) {
			console.warn("Skipping notification: invalid departmentId", payload.departmentId);
			return;
		}

		// Get recipients by role AND department if not provided
		let recipients = payload.recipients;
		if (!recipients) {
			// Filter users by both role AND department
			const users = await getUsersByRoleAndDepartment(
				payload.role as "user" | "admin" | "viewer",
				payload.departmentId,
			);

			if (users.length === 0) {
				console.log(
					`No users found for role ${payload.role} in department ${payload.departmentId}`,
				);
				return; // Skip notification if no recipients
			}

			const recipientIds = users.map((user) => user.id);
			recipients = {
				read: [],
				unread: recipientIds.map((id) => ({ user: id, date: new Date() })),
			};
		}

		const authenticatedUserId = (req as any).userId as string | undefined;
		const notificationData = {
			source: authenticatedUserId || "unknown",
			category: payload.category,
			title: payload.title,
			description: payload.description,
			departmentId: payload.departmentId,
			recipients: recipients,
			metadata: payload.departmentId
				? { ...(payload.metadata || {}), departmentId: payload.departmentId }
				: payload.metadata,
		};

		// Fire-and-forget logging
		prisma.notification
			.create({
				data: notificationData,
			})
			.catch((err) => console.error("Notification DB insert failed:", err.message));
	} catch (error: any) {
		console.error("Failed to log notification:", error.message);
	}
}

/**
 * Department-specific notification configuration
 */
export interface DepartmentNotificationConfig {
	departmentIds: string[]; // Array of department IDs to send to
	role: string;
	title: string;
	description: string;
	category: string;
	metadata?: any;
}

/**
 * Logs notifications to specific departments with custom messages per department.
 * Allows you to send different notifications to different departments, or only to selected departments.
 * Recipients are automatically filtered by BOTH role AND department.
 *
 * @example
 * // Send to specific departments with different messages
 * await logNotificationForDepartments(req, {
 *   source: "67890abcdef1234567890abc", // Valid 24-char ObjectId
 *   notifications: [
 *     {
 *       departmentIds: ["dept1_id_24chars", "dept2_id_24chars"],
 *       role: "admin",
 *       title: "New Product for Your Department",
 *       description: "Product X is now available",
 *       category: "product_management"
 *     },
 *     {
 *       departmentIds: ["dept3_id_24chars"],
 *       role: "admin",
 *       title: "Different Message for Dept 3",
 *       description: "Special announcement for dept 3",
 *       category: "product_management"
 *     }
 *   ]
 * });
 */
export async function logNotificationForDepartments(
	req: Request,
	payload: {
		source: string;
		notifications: DepartmentNotificationConfig[];
	},
) {
	try {
		for (const notification of payload.notifications) {
			// For each department ID in the config
			for (const departmentId of notification.departmentIds) {
				// Validate departmentId is a valid ObjectId (24 hex chars)
				if (!departmentId || departmentId.length !== 24) {
					console.warn(`Skipping notification for invalid departmentId: ${departmentId}`);
					continue;
				}

				// Get users for this specific role and department
				const users = await getUsersByRoleAndDepartment(
					notification.role as "user" | "admin" | "viewer",
					departmentId,
				);

				if (users.length === 0) {
					console.log(
						`No users found for role ${notification.role} in department ${departmentId}`,
					);
					continue;
				}

				const recipientIds = users.map((user) => user.id);

				const authenticatedUserId = (req as any).userId as string | undefined;
				const notificationData = {
					source: payload.source || authenticatedUserId || "unknown",
					category: notification.category,
					title: notification.title,
					description: notification.description,
					departmentId: departmentId, // Use the loop's departmentId
					recipients: {
						read: [],
						unread: recipientIds.map((id) => ({ user: id, date: new Date() })),
					},
					metadata: notification.metadata
						? { ...notification.metadata, departmentId }
						: { departmentId },
				};

				// Fire-and-forget logging
				prisma.notification
					.create({
						data: notificationData,
					})
					.catch((err) =>
						console.error(
							`Notification DB insert failed for department ${departmentId}:`,
							err.message,
						),
					);
			}
		}
	} catch (error: any) {
		console.error("Failed to log department-specific notification:", error.message);
	}
}
