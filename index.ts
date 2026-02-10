import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { PrismaClient } from "./generated/prisma";
import { config } from "./config/config";
import openApiSpecs from "./docs/openApiSpecs";
import verifyToken from "./middleware/verifyToken";
import { connectAllDatabases, disconnectAllDatabases } from "./config/database";
import { securityMiddleware, devSecurityMiddleware } from "./middleware/security";
import { authSecurityMiddleware } from "./middleware/security";
import { hidePasswordMiddleware } from "./middleware/passwordSanitise";
import { io, app, server } from "./lib/socket";
import verifyRole from "./middleware/verifyRole";

process.setMaxListeners(50);

// Log uncaught exceptions and unhandled promise rejections FIRST
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
	// const app = express();
	const prisma = new PrismaClient();
	prisma.$use(hidePasswordMiddleware());

	// const server = createServer(app);
	// const io = new Server(server, {
	// 	cors: {
	// 		origin: config.cors.origins,
	// 		credentials: config.cors.credentials,
	// 	},
	// });

	app.use((req: Request, res: Response, next: NextFunction) => {
		(req as any).io = io;
		next();
	});

	// Apply security middleware based on environment
	if (process.env.NODE_ENV === "production") {
		app.use(securityMiddleware);
		console.log("🔒 Production security middleware enabled");
	} else {
		app.use(devSecurityMiddleware);
		console.log("⚠ Development security middleware enabled (relaxed mode)");
	}

	const template = require("./app/template")(prisma);
	const person = require("./app/person")(prisma);
	const role = require("./app/role")(prisma);
	const user = require("./app/user")(prisma);
	const product = require("./app/product")(prisma);
	const batch = require("./app/batch")(prisma);
	const supplier = require("./app/supplier")(prisma);
	const transaction = require("./app/transaction")(prisma);
	const department = require("./app/department")(prisma);
	const auth = require("./app/auth")(prisma);
	const transactionitem = require("./app/transaction-item")(prisma);
	const inventoryrecord = require("./app/inventoryRecord")(prisma);
	const category = require("./app/category")(prisma);
	const delivery = require("./app/delivery-request")(prisma);
	const deliveryitem = require("./app/deliveryItem")(prisma);
	const deliveryReceipt = require("./app/deliveryReceipt")(prisma);
	const supplieritem = require("./app/supplierItem")(prisma);
	const productType = require("./app/product-type")(prisma);
	const alert = require("./app/alert")(prisma);
	const activitylog = require("./app/activityLog")(prisma);
	const auditlog = require("./app/auditLog")(prisma);
	const notification = require("./app/notification")(prisma);
	const systemlog = require("./app/systemLog")(prisma);
	const deliveryorder = require("./app/deliveryOrder")(prisma);
	const price = require("./app/price")(prisma);
	const stockmovementitem = require("./app/stockMovementItem")(prisma);
	const deliveryorderitem = require("./app/deliveryOrderItem")(prisma);
	const deliveryreceiptitem = require("./app/deliveryReceiptItem")(prisma);
	const metrics = require("./app/metrics")(prisma);
	const organization = require("./app/organization")(prisma);
	const patient = require("./app/patient")(prisma);
	const medicine = require("./app/medicine")(prisma);
	const approval = require("./app/approval")(prisma);

	const docs = require("./app/docs/docs");

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
		// Import slaMonitor at the top level instead
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

	// Apply middleware for protected routes, excluding /docs and /auth
	app.use(config.baseApiPath, (req: Request, res: Response, next: NextFunction) => {
		if (req.path.startsWith("/docs") || req.path.startsWith("/auth")) {
			// Skip middleware for the docs and auth routes
			return next();
		}
		verifyToken(req, res, () => {
			next();
		});
	});

	app.use(config.baseApiPath, template);
	app.use(config.baseApiPath, person);
	app.use(config.baseApiPath, role);
	app.use(config.baseApiPath, user);
	app.use(config.baseApiPath, product);
	app.use(config.baseApiPath, batch);
	app.use(config.baseApiPath, supplier);

	app.use(config.baseApiPath, transaction);
	app.use(config.baseApiPath, department);
	app.use(config.baseApiPath, auth);
	app.use(config.baseApiPath, transactionitem);
	app.use(config.baseApiPath, inventoryrecord);
	app.use(config.baseApiPath, deliveryReceipt);
	app.use(config.baseApiPath, delivery);
	app.use(config.baseApiPath, category);

	app.use(config.baseApiPath, deliveryitem);
	app.use(config.baseApiPath, supplieritem);
	app.use(config.baseApiPath, productType);
	app.use(config.baseApiPath, alert);
	app.use(config.baseApiPath, activitylog);
	app.use(config.baseApiPath, auditlog);
	app.use(config.baseApiPath, notification);
	app.use(config.baseApiPath, systemlog);
	app.use(config.baseApiPath, deliveryorder);
	app.use(config.baseApiPath, stockmovementitem);
	app.use(config.baseApiPath, price);
	app.use(config.baseApiPath, deliveryorderitem);
	app.use(config.baseApiPath, deliveryreceiptitem);
	app.use(config.baseApiPath, deliveryreceiptitem);
	app.use(config.baseApiPath, metrics);
	app.use(config.baseApiPath, organization);
	app.use(config.baseApiPath, patient);
	app.use(config.baseApiPath, medicine);
	app.use(config.baseApiPath, approval);
	app.use(config.baseApiPath, docs(prisma, app));

	// Store app instance globally for docs generation after all routes are registered
	(global as any).app = app;

	server.listen(config.port, async () => {
		await connectAllDatabases();
		console.log(`Server is running on port ${config.port}`);
	});

	// Graceful shutdown handler
	const gracefulShutdown = async (signal: string) => {
		try {
			await disconnectAllDatabases();
			console.log("✅ All database connections closed");
			process.exit(0);
		} catch (error) {
			console.error("❌ Error during shutdown:", error);
			process.exit(1);
		}
	};
	// Graceful shutdown
	process.on("SIGINT", async () => {
		console.log("Received SIGINT, shutting down gracefully...");
		await prisma.$disconnect();
		server.close(() => {
			process.exit(0);
		});
	});

	process.on("SIGTERM", async () => {
		console.log("Received SIGTERM, shutting down gracefully...");
		await prisma.$disconnect();
		server.close(() => {
			process.exit(0);
		});
	});

	// (handlers are already registered at the top of the file)
} catch (error) {
	console.error("=== STARTUP ERROR ===");
	console.error("Error during app initialization:", error);
	console.error("Stack:", error instanceof Error ? error.stack : error);
	console.error("====================");
	process.exit(1);
}
