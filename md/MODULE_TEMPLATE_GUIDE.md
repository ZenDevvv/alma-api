# ALMA API — Module Template Guide

This document is a **prompt-ready reference** for generating new API modules. Every new entity module **must** follow the standard 3-file pattern (`index.ts`, `[entity].router.ts`, `[entity].controller.ts`) plus supporting files (Zod schema, constant config entries, route registration).

Use this guide as a copy-paste scaffold — replace all `__Entity__` placeholders with the actual entity name.

---

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [File Structure](#file-structure)
3. [Step 1 — Prisma Schema](#step-1--prisma-schema)
4. [Step 2 — Zod Validation Schema](#step-2--zod-validation-schema)
5. [Step 3 — Config Constants](#step-3--config-constants)
6. [Step 4 — index.ts (Module Entry)](#step-4--indexts-module-entry)
7. [Step 5 — Router](#step-5--router)
8. [Step 6 — Controller](#step-6--controller)
9. [Step 7 — Register the Module](#step-7--register-the-module)
10. [Checklist](#checklist)

---

## Naming Conventions

| Context | Convention | Example (entity = "Course") |
|---|---|---|
| Folder name | `camelCase` | `app/course` |
| Controller file | `[entity].controller.ts` | `course.controller.ts` |
| Router file | `[entity].router.ts` | `course.router.ts` |
| Module export | `[entity]Module` | `courseModule` |
| Prisma model | `PascalCase` | `Course` |
| Prisma collection | `lowercase plural` via `@@map` | `@@map("courses")` |
| Zod full schema | `[Entity]Schema` | `CourseSchema` |
| Zod create schema | `Create[Entity]Schema` | `CreateCourseSchema` |
| Zod update schema | `Update[Entity]Schema` | `UpdateCourseSchema` |
| Logger child | `{ module: "[entity]" }` | `{ module: "course" }` |
| API path | `/[entity]` (singular lowercase) | `/course` |
| Cache keys | `cache:[entity]:byId:${id}:*`, `cache:[entity]:list:*` | `cache:course:byId:${id}:*` |
| Config keys | `UPPER_SNAKE_CASE` | `COURSE` |

---

## File Structure

```
alma-api/
├── app/
│   └── [entity]/
│       ├── index.ts                  # Module entry — wires router + controller
│       ├── [entity].router.ts        # Route definitions + OpenAPI docs + cache
│       └── [entity].controller.ts    # CRUD business logic
├── zod/
│   └── [entity].zod.ts              # Zod validation schemas
├── prisma/
│   └── schema/
│       └── [entity].prisma           # Prisma model definition
├── config/
│   └── constant.ts                   # Add entity to ERROR, SUCCESS, ACTIVITY_LOG, AUDIT_LOG
└── index.ts                          # Register module in main entry
```

---

## Step 1 — Prisma Schema

File: `prisma/schema/[entity].prisma`

Every model follows this standard structure:

```prisma
model __Entity__ {
  id          String  @id @default(auto()) @map("_id") @db.ObjectId
  // --- Entity-specific fields ---
  name        String
  description String?
  // ... add fields as needed ...

  // --- Relations ---
  orgId        String       @db.ObjectId
  organization Organization @relation(fields: [orgId], references: [id])
  // ... add other relations as needed ...

  // --- Soft delete ---
  isDeleted Boolean @default(false)

  // --- Audit ---
  createdBy String?  @db.ObjectId
  updatedBy String?  @db.ObjectId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // --- Indexes ---
  @@index([orgId])
  @@map("__entities__")  // lowercase plural collection name
}
```

After adding the schema, regenerate the Prisma client:

```bash
npx prisma generate
```

---

## Step 2 — Zod Validation Schema

File: `zod/[entity].zod.ts`

### Relation Fields Rule

The full entity schema (`__Entity__Schema`) **must include all relation fields** from the Prisma model as **optional** Zod fields. This ensures the inferred TypeScript type (`__Entity__`) always carries the relation types, which is useful when the API returns populated/included relations.

**How to apply:**

1. Look at the Prisma model for the entity and identify all **relation fields** (fields with `@relation` or array relations like `RelatedModel[]`).
2. **Only include relation fields where the current model owns the foreign key ID.** If the Prisma model has a foreign key field (e.g. `personId`, `orgId`), include the corresponding relation schema (e.g. `person: PersonSchema.optional()`). If the model does **not** have the foreign key (i.e. it's the "other side" of the relation — has-many or reverse belongs-to), **do not** include that relation field in the Zod schema. This avoids circular dependencies.
3. **If the related model's Zod file does not exist yet, create it first.** Look up the related Prisma model in `prisma/schema/[related].prisma` and generate the full Zod file at `zod/[related].zod.ts` following the same Step 2 conventions (full schema, create schema, update schema, enums, composite types). This ensures the import will resolve. Recursively apply this rule — if *that* model also has relations whose Zod files are missing, create those too before proceeding.
4. In `Create__Entity__Schema` and `Update__Entity__Schema`, **omit all relation fields** — they are managed by foreign key IDs, not by passing nested objects.

**Summary — when to include a relation field:**

| Prisma model has... | Include in Zod schema? | Example |
|---|---|---|
| Foreign key ID + relation (belongs-to) | **Yes** — import the related schema | `personId` + `person Person?` → `person: PersonSchema.optional()` |
| Only array relation (has-many) | **No** — skip it | `enrollments Enrollment[]` → do not add |
| Only reverse relation (no FK) | **No** — skip it | `users User[]` on Organization → do not add |

```typescript
import { z } from "zod";
import { isValidObjectId } from "mongoose";
// Import related entity schemas for relation fields
import { __Related__Schema } from "./__related__.zod";

// Full schema (includes all fields + relation fields)
export const __Entity__Schema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	// ... match Prisma model fields ...

	// --- Foreign key IDs ---
	__related__Id: z.string().refine((val) => isValidObjectId(val)).optional(),

	// --- Relation fields (only where this model owns the foreign key) ---
	__related__: __Related__Schema.optional(),

	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type __Entity__ = z.infer<typeof __Entity__Schema>;

// Create schema — omit auto-generated fields AND relation fields
export const Create__Entity__Schema = __Entity__Schema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	// Omit all relation fields — use foreign key IDs instead
	__related__: true,
}).partial({
	description: true,
	isDeleted: true,
});

export type Create__Entity__ = z.infer<typeof Create__Entity__Schema>;

// Update schema — partial, exclude immutable fields AND relation fields
export const Update__Entity__Schema = __Entity__Schema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	// Omit all relation fields — use foreign key IDs instead
	__related__: true,
}).partial();

export type Update__Entity__ = z.infer<typeof Update__Entity__Schema>;

// ─── Pagination Schema (shared across modules) ──────────────────────

export const PaginationSchema = z.object({
	total: z.number(),
	page: z.number(),
	limit: z.number(),
	totalPages: z.number(),
	hasNext: z.boolean(),
	hasPrev: z.boolean(),
});

// GetAll schema — represents the shape returned by the getAll API response
export const GetAll__Entities__Schema = z.object({
	__entities__: z.array(__Entity__Schema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAll__Entities__ = z.infer<typeof GetAll__Entities__Schema>;
```

> **Note:** `PaginationSchema` is a shared schema. If it already exists in another Zod file in your project, import it from there instead of redefining it. Otherwise, define it in the module's Zod file or in a shared `zod/common.zod.ts`.

**Example — User entity with `person` and `organization` relations:**

```typescript
import { PersonSchema } from "./person.zod";
import { OrganizationSchema } from "./organization.zod";

export const UserSchema = z.object({
	// ... scalar fields ...
	personId: z.string().refine((val) => isValidObjectId(val)).optional(),
	orgId: z.string().refine((val) => isValidObjectId(val)).optional(),

	// Relation fields
	person: PersonSchema.optional(),
	organization: OrganizationSchema.optional(),

	// ... audit fields ...
});

export const CreateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	person: true,          // omit relation
	organization: true,    // omit relation
}).partial({ /* ... */ });

export const UpdateUserSchema = UserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	person: true,          // omit relation
	organization: true,    // omit relation
}).partial();

export const GetAllUsersSchema = z.object({
	users: z.array(UserSchema),
	pagination: PaginationSchema.optional(),
	count: z.number().optional(),
});

export type GetAllUsers = z.infer<typeof GetAllUsersSchema>;
```

---

## Step 3 — Config Constants

File: `config/constant.ts`

Add entries to each section using the factory functions:

```typescript
// In config.ERROR:
__ENTITY_UPPER__: createEntityErrors("__Entity__", "__entity__", "__entities__"),

// In config.SUCCESS:
__ENTITY_UPPER__: createEntitySuccess("__Entity__", "__Entities__", "__entity__"),

// In config.ACTIVITY_LOG:
__ENTITY_UPPER__: createActivityLog("__ENTITY_UPPER__", "__Entity__", "__entity__"),

// In config.AUDIT_LOG.RESOURCES:
__ENTITY_UPPER__: "__entities__",

// In config.AUDIT_LOG.ENTITY_TYPES:
__ENTITY_UPPER__: "__entity__",

// In config.AUDIT_LOG (top-level entity key):
__ENTITY_UPPER__: createAuditLogEntity("__entity__"),
```

**Example for Course:**

```typescript
// config.ERROR:
COURSE: createEntityErrors("Course", "course", "courses"),

// config.SUCCESS:
COURSE: createEntitySuccess("Course", "Courses", "course"),

// config.ACTIVITY_LOG:
COURSE: createActivityLog("COURSE", "Course", "course"),

// config.AUDIT_LOG.RESOURCES:
COURSE: "courses",

// config.AUDIT_LOG.ENTITY_TYPES:
COURSE: "course",

// config.AUDIT_LOG:
COURSE: createAuditLogEntity("course"),
```

---

## Step 4 — index.ts (Module Entry)

File: `app/[entity]/index.ts`

```typescript
import express, { Router } from "express";
import { controller } from "./__entity__.controller";
import { router } from "./__entity__.router";
import { PrismaClient } from "../../generated/prisma";

export const __entity__Module = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
```

---

## Step 5 — Router

File: `app/[entity]/[entity].router.ts`

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { cache } from "../../middleware/cache";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/__entity__";

	/**
	 * @openapi
	 * /api/__entity__/{id}:
	 *   get:
	 *     summary: Get __entity__ by ID
	 *     description: Retrieve a specific __entity__ by its unique identifier with optional field selection
	 *     tags: [__Entity__]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *         description: __Entity__ ID (MongoDB ObjectId format)
	 *         example: "507f1f77bcf86cd799439011"
	 *       - in: query
	 *         name: fields
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Comma-separated list of fields to include (supports nested fields with dot notation)
	 *         example: "id,name,description"
	 *     responses:
	 *       200:
	 *         description: __Entity__ retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/:id",
		cache({
			ttl: 90,
			keyGenerator: (req: Request) => {
				const fields = (req.query as any).fields || "full";
				return `cache:__entity__:byId:${req.params.id}:${fields}`;
			},
		}),
		controller.getById,
	);

	/**
	 * @openapi
	 * /api/__entity__:
	 *   get:
	 *     summary: Get all __entities__
	 *     description: Retrieve __entities__ with filtering, pagination, sorting, field selection, and optional grouping
	 *     tags: [__Entity__]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: query
	 *         name: page
	 *         schema: { type: integer, minimum: 1, default: 1 }
	 *       - in: query
	 *         name: limit
	 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
	 *       - in: query
	 *         name: order
	 *         schema: { type: string, enum: [asc, desc], default: desc }
	 *       - in: query
	 *         name: sort
	 *         schema: { type: string }
	 *         description: Field to sort by or JSON object for multi-field sorting
	 *       - in: query
	 *         name: fields
	 *         schema: { type: string }
	 *         description: Comma-separated fields to include (supports dot notation)
	 *       - in: query
	 *         name: query
	 *         schema: { type: string }
	 *         description: Search query to filter results
	 *       - in: query
	 *         name: filter
	 *         schema: { type: string }
	 *         description: JSON array of filter objects
	 *       - in: query
	 *         name: groupBy
	 *         schema: { type: string }
	 *       - in: query
	 *         name: document
	 *         schema: { type: string, enum: ["true"] }
	 *       - in: query
	 *         name: pagination
	 *         schema: { type: string, enum: ["true"] }
	 *       - in: query
	 *         name: count
	 *         schema: { type: string, enum: ["true"] }
	 *     responses:
	 *       200:
	 *         description: __Entities__ retrieved successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.get(
		"/",
		cache({
			ttl: 60,
			keyGenerator: (req: Request) => {
				const queryKey = Buffer.from(JSON.stringify(req.query || {})).toString("base64");
				return `cache:__entity__:list:${queryKey}`;
			},
		}),
		controller.getAll,
	);

	/**
	 * @openapi
	 * /api/__entity__:
	 *   post:
	 *     summary: Create new __entity__
	 *     description: Create a new __entity__ with the provided data
	 *     tags: [__Entity__]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - name
	 *             properties:
	 *               name:
	 *                 type: string
	 *                 minLength: 1
	 *               description:
	 *                 type: string
	 *     responses:
	 *       201:
	 *         description: __Entity__ created successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.post("/", controller.create);

	/**
	 * @openapi
	 * /api/__entity__/{id}:
	 *   patch:
	 *     summary: Update __entity__
	 *     description: Update __entity__ data by ID (partial update)
	 *     tags: [__Entity__]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *     responses:
	 *       200:
	 *         description: __Entity__ updated successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.patch("/:id", controller.update);

	/**
	 * @openapi
	 * /api/__entity__/{id}:
	 *   delete:
	 *     summary: Delete __entity__
	 *     description: Permanently delete a __entity__ by ID
	 *     tags: [__Entity__]
	 *     security:
	 *       - bearerAuth: []
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *     responses:
	 *       200:
	 *         description: __Entity__ deleted successfully
	 *       400:
	 *         $ref: '#/components/responses/BadRequest'
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 *       404:
	 *         $ref: '#/components/responses/NotFound'
	 *       500:
	 *         $ref: '#/components/responses/InternalServerError'
	 */
	routes.delete("/:id", controller.remove);

	route.use(path, routes);

	return route;
};
```

---

## Step 6 — Controller

File: `app/[entity]/[entity].controller.ts`

```typescript
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors, handlePrismaError } from "../../helper/error-handler";
import { Create__Entity__Schema, Update__Entity__Schema } from "../../zod/__entity__.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const __entity__Logger = logger.child({ module: "__entity__" });

export const controller = (prisma: PrismaClient) => {
	// ─── CREATE ─────────────────────────────────────
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		// Handle form-data content types
		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			__entity__Logger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			__entity__Logger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Validate with Zod
		const validation = Create__Entity__Schema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error);
			__entity__Logger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const __entity__ = await prisma.__entity__.create({ data: validation.data });
			__entity__Logger.info(`__Entity__ created successfully: ${__entity__.id}`);

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.__ENTITY_UPPER__.ACTIONS.CREATE,
				description: `${config.ACTIVITY_LOG.__ENTITY_UPPER__.DESCRIPTIONS.CREATED}: ${__entity__.name || __entity__.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.__ENTITY_UPPER__.PAGES.CREATION,
				},
			});

			// Log audit
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.__ENTITY_UPPER__,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.__ENTITY_UPPER__,
				entityId: __entity__.id,
				changesBefore: null,
				changesAfter: {
					id: __entity__.id,
					name: __entity__.name,
					// ... include key fields for audit trail ...
					createdAt: __entity__.createdAt,
					updatedAt: __entity__.updatedAt,
				},
				description: `${config.AUDIT_LOG.__ENTITY_UPPER__.DESCRIPTIONS.CREATED}: ${__entity__.name || __entity__.id}`,
			});

			// Invalidate list cache
			try {
				await invalidateCache.byPattern("cache:__entity__:list:*");
				__entity__Logger.info("__Entity__ list cache invalidated after creation");
			} catch (cacheError) {
				__entity__Logger.warn(
					"Failed to invalidate cache after __entity__ creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.__ENTITY_UPPER__.CREATED,
				__entity__,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.CREATE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	// ─── GET ALL ────────────────────────────────────
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, __entity__Logger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		__entity__Logger.info(
			`Getting __entities__, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause — always exclude soft-deleted
			const whereClause: Prisma.__Entity__WhereInput = {
				isDeleted: false,
			};

			// Search fields — update these to match your entity's searchable fields
			const searchFields = ["name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("__Entity__", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			// Filter conditions
			if (filter) {
				const filterConditions = buildFilterConditions("__Entity__", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [__entities__, total] = await Promise.all([
				document ? prisma.__entity__.findMany(findManyQuery) : [],
				count ? prisma.__entity__.count({ where: whereClause }) : 0,
			]);

			__entity__Logger.info(`Retrieved ${__entities__.length} __entities__`);

			const processedData =
				groupBy && document ? groupDataByField(__entities__, groupBy as string) : __entities__;

			const responseData: Record<string, any> = {
				...(document && { __entities__: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.__ENTITY_UPPER__.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.GET_ALL_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	// ─── GET BY ID ──────────────────────────────────
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				__entity__Logger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				__entity__Logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			__entity__Logger.info(`${config.SUCCESS.__ENTITY_UPPER__.GETTING_BY_ID}: ${id}`);

			// Check Redis cache first
			const cacheKey = `cache:__entity__:byId:${id}:${fields || "full"}`;
			let __entity__ = null;

			try {
				if (redisClient.isClientConnected()) {
					__entity__ = await redisClient.getJSON(cacheKey);
					if (__entity__) {
						__entity__Logger.info(`__Entity__ ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				__entity__Logger.warn(`Redis cache retrieval failed for __entity__ ${id}:`, cacheError);
			}

			// Fetch from database if not cached
			if (!__entity__) {
				const query: Prisma.__Entity__FindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				__entity__ = await prisma.__entity__.findFirst(query);

				// Store in cache
				if (__entity__ && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, __entity__, 3600);
						__entity__Logger.info(`__Entity__ ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						__entity__Logger.warn(
							`Failed to store __entity__ ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!__entity__) {
				__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.__ENTITY_UPPER__.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			__entity__Logger.info(`${config.SUCCESS.__ENTITY_UPPER__.RETRIEVED}: ${(__entity__ as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.__ENTITY_UPPER__.RETRIEVED,
				__entity__,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.ERROR_GETTING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	// ─── UPDATE ─────────────────────────────────────
	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				__entity__Logger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = Update__Entity__Schema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error);
				__entity__Logger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				__entity__Logger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			__entity__Logger.info(`Updating __entity__: ${id}`);

			// Verify entity exists
			const existing__Entity__ = await prisma.__entity__.findFirst({
				where: { id },
			});

			if (!existing__Entity__) {
				__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.__ENTITY_UPPER__.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updated__Entity__ = await prisma.__entity__.update({
				where: { id },
				data: prismaData,
			});

			// Invalidate caches
			try {
				await invalidateCache.byPattern(`cache:__entity__:byId:${id}:*`);
				await invalidateCache.byPattern("cache:__entity__:list:*");
				__entity__Logger.info(`Cache invalidated after __entity__ ${id} update`);
			} catch (cacheError) {
				__entity__Logger.warn(
					"Failed to invalidate cache after __entity__ update:",
					cacheError,
				);
			}

			__entity__Logger.info(`${config.SUCCESS.__ENTITY_UPPER__.UPDATED}: ${updated__Entity__.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.__ENTITY_UPPER__.UPDATED,
				{ __entity__: updated__Entity__ },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.ERROR_UPDATING}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	// ─── DELETE ──────────────────────────────────────
	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				__entity__Logger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			__entity__Logger.info(`${config.SUCCESS.__ENTITY_UPPER__.DELETED}: ${id}`);

			// Verify entity exists
			const existing__Entity__ = await prisma.__entity__.findFirst({
				where: { id },
			});

			if (!existing__Entity__) {
				__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.__ENTITY_UPPER__.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.__entity__.delete({
				where: { id },
			});

			// Invalidate caches
			try {
				await invalidateCache.byPattern(`cache:__entity__:byId:${id}:*`);
				await invalidateCache.byPattern("cache:__entity__:list:*");
				__entity__Logger.info(`Cache invalidated after __entity__ ${id} deletion`);
			} catch (cacheError) {
				__entity__Logger.warn(
					"Failed to invalidate cache after __entity__ deletion:",
					cacheError,
				);
			}

			__entity__Logger.info(`${config.SUCCESS.__ENTITY_UPPER__.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.__ENTITY_UPPER__.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			__entity__Logger.error(`${config.ERROR.__ENTITY_UPPER__.DELETE_FAILED}: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
```

---

## Step 7 — Register the Module

File: `index.ts` (project root)

**1. Add the import:**

```typescript
import { __entity__Module } from "./app/__entity__";
```

**2. Initialize the module** (after `const prisma = new PrismaClient()`):

```typescript
const __entity__ = __entity__Module(prisma);
```

**3. Register the route** (in the route registration section):

```typescript
app.use(config.baseApiPath, __entity__);
```

This exposes the module at `GET/POST /api/__entity__` and `GET/PATCH/DELETE /api/__entity__/:id`.

---

## Checklist

Use this checklist when creating a new module:

- [ ] **Prisma schema** created in `prisma/schema/[entity].prisma`
- [ ] **Prisma client** regenerated (`npx prisma generate`)
- [ ] **Zod schemas** created in `zod/[entity].zod.ts` (full, create, update)
- [ ] **Config constants** added to `config/constant.ts` (ERROR, SUCCESS, ACTIVITY_LOG, AUDIT_LOG)
- [ ] **Module folder** created at `app/[entity]/`
- [ ] **index.ts** — module entry wiring router + controller
- [ ] **[entity].router.ts** — routes with OpenAPI docs and cache middleware
- [ ] **[entity].controller.ts** — CRUD with validation, logging, caching, audit
- [ ] **Module registered** in root `index.ts` (import, initialize, `app.use`)
- [ ] **Relation fields** included in full Zod schema (optional), omitted in Create/Update schemas
- [ ] **GetAll schema** created with `z.array(EntitySchema)`, optional `pagination`, and optional `count`
- [ ] **Search fields** updated in `getAll` controller to match entity's searchable fields
- [ ] **Audit `changesAfter`** in `create` includes the entity's key fields

---

## Placeholder Reference

When using this guide as a prompt, do a **find-and-replace** with these tokens:

| Placeholder | Replace with | Example |
|---|---|---|
| `__Entity__` | PascalCase entity name | `Course` |
| `__entity__` | camelCase entity name | `course` |
| `__entities__` | camelCase plural | `courses` |
| `__Entities__` | PascalCase plural | `Courses` |
| `__ENTITY_UPPER__` | UPPER_SNAKE_CASE | `COURSE` |
