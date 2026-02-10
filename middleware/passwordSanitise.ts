import { Prisma } from "../generated/prisma";

/**
 * Recursively removes all "password" fields from any object or array.
 * This version edits objects in-place for better performance.
 */
function removePasswordDeep(obj: any): any {
	if (!obj || typeof obj !== "object") return obj;

	if (Array.isArray(obj)) {
		for (let i = 0; i < obj.length; i++) {
			obj[i] = removePasswordDeep(obj[i]);
		}
		return obj;
	}

	// Remove password key if exists
	if ("password" in obj) {
		delete obj.password;
	}

	// Recursively clean nested objects
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		if (typeof value === "object" && value !== null) {
			obj[key] = removePasswordDeep(value);
		}
	}

	return obj;
}

/**
 * Prisma middleware that automatically strips all "password" fields
 * from User queries and any nested includes (at any depth).
 * Only sanitizes findMany queries to avoid interfering with auth.
 */
export function hidePasswordMiddleware(): Prisma.Middleware {
	return async (params, next) => {
		const result = await next(params);

		// Only sanitize findMany queries to avoid interfering with auth
		// This allows login (findFirst) to access password for verification
		if (params.model === "User" && params.action === "findMany") {
			return removePasswordDeep(result);
		}

		// Also sanitize any result that contains User objects in nested relationships
		// This handles cases where other models include User data, but only for non-User models
		if (
			result &&
			typeof result === "object" &&
			["findMany", "findFirst", "findUnique"].includes(params.action) &&
			params.model !== "User"
		) {
			return removePasswordDeep(result);
		}

		return result;
	};
}
