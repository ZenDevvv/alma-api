import { NextFunction, Response } from "express";
import { AuthRequest } from "./verifyToken";

/**
 * Permission rule for role and subrole combination
 * Format: "role:subrole:action" or "role:subrole:*" or "role:*:action" etc.
 *
 * Examples:
 * - "admin:super:*" - Admin with super subrole can do all actions
 * - "user:staff:read" - User with staff subrole can only read
 * - "user:supervisor:create,read,update" - User with supervisor can create, read, and update
 * - "admin:*:*" - Admin with any subrole can do everything
 */
type PermissionRule = string;

/**
 * Verify if a user has the required role, subrole, and action permissions
 *
 * @param allowedPermissions - Array of permission rules in format "role:subrole:actions"
 *
 * Usage examples:
 * ```typescript
 * // Allow admin with super subrole to do anything
 * verifyRole(["admin:super:*"])
 *
 * // Allow user with staff subrole to only read
 * verifyRole(["user:staff:read"])
 *
 * // Allow multiple combinations
 * verifyRole([
 *   "admin:super:*",
 *   "user:supervisor:create,read,update,delete",
 *   "user:staff:read"
 * ])
 *
 * // Allow any subrole or no subrole
 * verifyRole(["admin:*:*", "user:*:read"])
 * ```
 */
const verifyRole = (allowedPermissions: PermissionRule[]) => {
	return (req: AuthRequest, res: Response, next: NextFunction) => {
		const userRole = req.role;
		const userSubRole = req.subRole || null;
		console.log("Request : ", userRole);
		if (!userRole) {
			res.status(401).json({
				success: false,
				message: "Not authorized",
				error: "Missing role information",
			});
			return;
		}

		// Check each allowed permission rule
		for (const rule of allowedPermissions) {
			const parts = rule.split(":");

			// Validate rule format
			if (parts.length !== 3) {
				console.warn(
					`Invalid permission rule format: ${rule}. Expected format: "role:subrole:actions"`,
				);
				continue;
			}

			const [allowedRole, allowedSubRole, allowedActions] = parts;

			// Check if role matches (must match exactly unless wildcard)
			const roleMatches = allowedRole === "*" || allowedRole === userRole;
			if (!roleMatches) continue;

			// Check if subrole matches (must match exactly unless wildcard)
			// "null" means no subrole required
			// "*" means any subrole (or no subrole) is allowed
			let subRoleMatches = false;
			if (allowedSubRole === "*") {
				// Wildcard: accept any subrole or no subrole
				subRoleMatches = true;
			} else if (allowedSubRole === "null") {
				// Only accept users with no subrole
				subRoleMatches = userSubRole === null;
			} else {
				// Must match exactly
				subRoleMatches = allowedSubRole === userSubRole;
			}

			if (!subRoleMatches) continue;

			// Both role and subrole match - grant access
			next();
			return;
		}

		// No matching permissions found
		res.status(403).json({
			success: false,
			message: "Access denied",
			error: `Insufficient permissions (role: ${userRole}, subrole: ${userSubRole || "none"}).`,
		});
		return;
	};
};

export default verifyRole;
