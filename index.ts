import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { PrismaClient } from "./generated/prisma";
import { config } from "./config/config";
import openApiSpecs from "./docs/openApiSpecs";
import verifyToken from "./middleware/verifyToken";
import type { AuthRequest } from "./middleware/verifyToken";
import { connectAllDatabases, disconnectAllDatabases } from "./config/database";
import {
	securityMiddleware,
	devSecurityMiddleware,
	authSecurityMiddleware,
} from "./middleware/security";
import { hidePasswordMiddleware } from "./middleware/passwordSanitise";
import { io, app, server } from "./lib/socket";
import { templateModule } from "./app/template";
import { personModule } from "./app/person";
import { roleModule } from "./app/role";
import { userModule } from "./app/user";
import { authModule } from "./app/auth";
import { notificationModule } from "./app/notification";
import { systemLogModule } from "./app/systemLog";
import { metricsModule } from "./app/metrics";
import { organizationModule } from "./app/organization";
import { courseModule } from "./app/course";
import { facultyModule } from "./app/faculty";
import { programModule } from "./app/program";
import { categoryModule } from "./app/category";

// Log uncaught exceptions and unhandled promise rejections
process.on("uncaughtException", (err) => {
	console.error("=== UNCAUGHT EXCEPTION ===");
	console.error("Error:", err.message);
	console.error("Stack:", err.stack);
	console.error("========================");
	process.exit(1);
});

process.on("unhandledRejection", (reason: any, promise) => {
	console.error("=== UNHANDLED PROMISE REJECTION ===");
	console.error("Promise:", promise);
	console.error("Reason:", reason);
	console.error("===============================");
	process.exit(1);
});

try {
	const prisma = new PrismaClient();
	prisma.$use(hidePasswordMiddleware());

	// Attach Socket.IO instance to every request
	app.use((req: Request, res: Response, next: NextFunction) => {
		(req as any).io = io;
		next();
	});

	// Apply security middleware based on environment
	if (process.env.NODE_ENV === "production") {
		app.use(securityMiddleware);
		console.log("Production security middleware enabled");
	} else {
		app.use(devSecurityMiddleware);
		console.log("Development security middleware enabled (relaxed mode)");
	}

	// Body parsing & cookies
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use(cookieParser());

	// Configure CORS
	app.use(
		cors({
			origin: config.cors.origins,
			credentials: config.cors.credentials,
		}),
	);

	// Initialize route modules
	const template = templateModule(prisma);
	const person = personModule(prisma);
	const role = roleModule(prisma);
	const user = userModule(prisma);
	const auth = authModule(prisma);
	const notification = notificationModule(prisma);
	const systemlog = systemLogModule(prisma);
	const metrics = metricsModule(prisma);
	const organization = organizationModule(prisma);
	const course = courseModule(prisma);
	const faculty = facultyModule(prisma);
	const program = programModule(prisma);
	const category = categoryModule(prisma);

	// Health check endpoint
	app.get("/", (req: Request, res: Response) => {
		res.status(200).json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
		});
	});

	// Enhanced health check with SLA status
	app.get("/health", (req: Request, res: Response) => {
		res.status(200).json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			message: "SLA monitoring is active",
		});
	});

	// Redis health check endpoint
	app.get("/health/redis", async (req: Request, res: Response) => {
		try {
			const { redisClient } = await import("./config/redis");
			const start = Date.now();
			await redisClient.ping();
			const latency = Date.now() - start;

			const stats = await redisClient.getClient().info("memory");
			const memoryMatch = stats.match(/used_memory_human:(.+)/);
			const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "Unknown";

			const dbsize = await redisClient.getClient().dbsize();

			res.status(200).json({
				status: "healthy",
				redis: {
					connected: redisClient.isClientConnected(),
					latency: `${latency}ms`,
					memoryUsage,
					totalKeys: dbsize,
				},
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			res.status(503).json({
				status: "unhealthy",
				redis: {
					connected: false,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				timestamp: new Date().toISOString(),
			});
		}
	});

	// Set up routes that don't need authentication
	if (process.env.NODE_ENV !== "production") {
		app.use(`${config.baseApiPath}/swagger`, swaggerUi.serve, swaggerUi.setup(openApiSpecs()));
	}

	// Apply authentication-specific security middleware
	app.use(`${config.baseApiPath}/auth`, authSecurityMiddleware);

	// Apply middleware for protected routes, excluding /auth
	app.use(config.baseApiPath, (req: Request, res: Response, next: NextFunction) => {
		if (req.path.startsWith("/auth")) {
			return next();
		}
		verifyToken(req as AuthRequest, res, () => {
			next();
		});
	});

	// Register routes
	app.use(config.baseApiPath, template);
	app.use(config.baseApiPath, person);
	app.use(config.baseApiPath, role);
	app.use(config.baseApiPath, user);
	app.use(config.baseApiPath, auth);
	app.use(config.baseApiPath, notification);
	app.use(config.baseApiPath, systemlog);
	app.use(config.baseApiPath, metrics);
	app.use(config.baseApiPath, organization);
	app.use(config.baseApiPath, course);
	app.use(config.baseApiPath, faculty);
	app.use(config.baseApiPath, program);
	app.use(config.baseApiPath, category);

	server.listen(config.port, async () => {
		await connectAllDatabases();
		console.log(`Server is running on port ${config.port}`);
	});

	// Graceful shutdown
	const gracefulShutdown = async (signal: string) => {
		console.log(`Received ${signal}, shutting down gracefully...`);
		try {
			await prisma.$disconnect();
			await disconnectAllDatabases();
			server.close(() => {
				console.log("All connections closed");
				process.exit(0);
			});
		} catch (error) {
			console.error("Error during shutdown:", error);
			process.exit(1);
		}
	};

	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
} catch (error) {
	console.error("=== STARTUP ERROR ===");
	console.error("Error during app initialization:", error);
	console.error("Stack:", error instanceof Error ? error.stack : error);
	console.error("====================");
	process.exit(1);
}
