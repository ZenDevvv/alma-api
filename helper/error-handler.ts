import { Response } from "express";

export interface ErrorDetail {
	field?: string;
	message: string;
}

export interface ErrorResponse {
	status: "error";
	message: string;
	code: number;
	errors?: ErrorDetail[];
	timestamp: string;
}

export function buildErrorResponse(
	message: string,
	code: number = 500,
	errors?: ErrorDetail[],
): ErrorResponse {
	return {
		status: "error",
		message,
		code,
		errors,
		timestamp: new Date().toISOString(),
	};
}

// Optional: Helper to convert Zod errors to ErrorDetail format
export interface ErrorDetail {
	field?: string;
	message: string;
}

export function formatZodErrors(zodError: any): ErrorDetail[] {
	if (!zodError || !zodError.issues) return [];

	return zodError.issues.map((issue: any) => ({
		field: issue.path.join("."),
		message: issue.message,
	}));
}
