import { Response } from "express";
import { Prisma } from "../generated/prisma";

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

export function handlePrismaError(error: unknown): ErrorResponse {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		switch (error.code) {
			case "P2002": {
				const rawTarget = error.meta?.target;
				const target = Array.isArray(rawTarget)
					? rawTarget
					: typeof rawTarget === "string"
						? [rawTarget]
						: [];
				// Extract field names from constraint names like "Organization_code_key"
				const fieldNames = target.map((t: string) => {
					const match = t.match(/^.+?_(.+?)_key$/);
					return match ? match[1] : t;
				});
				const fields = fieldNames.join(", ");
				return buildErrorResponse(
					`A record with this ${fields} already exists`,
					409,
					fieldNames.map((field: string) => ({
						field,
						message: `This ${field} is already taken`,
					})),
				);
			}
			case "P2025":
				return buildErrorResponse(
					(error.meta?.cause as string) || "Record not found",
					404,
				);
			case "P2003": {
				const fieldName = (error.meta?.field_name as string) || "field";
				return buildErrorResponse(
					`Related record not found for ${fieldName}`,
					400,
					[{ field: fieldName, message: "Referenced record does not exist" }],
				);
			}
			case "P2014":
				return buildErrorResponse(
					"This operation would violate a required relation",
					400,
				);
			default:
				return buildErrorResponse(
					`Database error: ${error.message}`,
					400,
				);
		}
	}

	if (error instanceof Prisma.PrismaClientValidationError) {
		return buildErrorResponse("Invalid data provided to database query", 400);
	}

	return buildErrorResponse(
		error instanceof Error ? error.message : "Internal server error",
		500,
	);
}
