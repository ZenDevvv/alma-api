import { PrismaClient } from "../generated/prisma";
import { roles } from "../config/constant";
const prisma = new PrismaClient();

/**
 * Gets all active users with a specific role
 */
export async function getUsersByRole(role: roles) {
	try {
		const users = await prisma.user.findMany({
			where: {
				role: role,
				isDeleted: false,
				status: "active",
			},
			select: {
				id: true,
				userName: true,
				email: true,
				role: true,
			},
		});

		return users;
	} catch (error: any) {
		console.error("Failed to get users by role:", error.message);
		return [];
	}
}

/**
 * Gets all active users with a specific role and department
 */
export async function getUsersByRoleAndDepartment(role: roles, departmentId: string) {
	try {
		const users = await prisma.user.findMany({
			where: {
				role: role,
				departmentId,
				isDeleted: false,
				status: "active",
			},
			select: {
				id: true,
				userName: true,
				email: true,
				role: true,
				departmentId: true,
			},
		});

		return users;
	} catch (error: any) {
		console.error("Failed to get users by role and department:", error.message);
		return [];
	}
}
