import { z } from "zod";

// ─── Pagination Schema (shared across all modules) ──────────────────────
export const PaginationSchema = z.object({
	total: z.number(),
	page: z.number(),
	limit: z.number(),
	totalPages: z.number(),
	hasNext: z.boolean(),
	hasPrev: z.boolean(),
});

export type Pagination = z.infer<typeof PaginationSchema>;
