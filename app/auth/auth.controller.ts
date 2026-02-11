import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import { getLogger } from "../../helper/logger";
import { RegisterSchema, LoginSchema, UpdatePasswordSchema } from "../../zod/auth.zod";
import { config } from "../../config/constant";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { buildErrorResponse, formatZodErrors, handlePrismaError } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler";

const logger = getLogger();
const authLogger = logger.child({ module: "auth" });

export const controller = (prisma: PrismaClient) => {
	const register = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const validationResult = RegisterSchema.safeParse(req.body);
			console.log("this is the validationResult", validationResult);

			if (!validationResult.success) {
				console.log("this is the error", validationResult.error);
				const formattedErrors = formatZodErrors(validationResult.error);
				authLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);

				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const {
				email,
				password,
				userName,
				role,
				subRole,
				orgId,
				person: {
					personalInfo,
					contactInfo,
					addresses,
					languages,
					preferredLanguage,
					documents,
					emergencyContacts,
					kycStatus,
				},
			} = validationResult.data;

			authLogger.info(`${config.INFO.USER.REGISTERING_USER}: ${email}`);

			const existingUser = await prisma.user.findUnique({
				where: { email: email },
			});

			if (existingUser) {
				authLogger.error(`User already exists: ${email}`);

				const errorResponse = buildErrorResponse("User already exists", 400, [
					{ field: "email", message: "Email is already registered" },
				]);

				res.status(400).json(errorResponse);
				return;
			}

			const hashedPassword = await argon2.hash(password);

			// Create Person record with all related data
			const person = await prisma.person.create({
				data: {
					personalInfo: personalInfo,
					contactInfo: contactInfo ?? [],
					addresses: addresses ?? [],
					languages: languages ?? [],
					preferredLanguage: preferredLanguage ?? null,
					documents: documents ?? null,
					emergencyContacts: emergencyContacts ?? [],
					kycStatus: kycStatus ?? "PENDING",
					...(orgId ? { orgId } : {}),
				},
			});

			// Create User record linked to Person
			const user = await prisma.user.create({
				data: {
					email,
					userName,
					password: hashedPassword,
					loginMethod: "email",
					role: role,
					personId: person.id,
					...(orgId ? { orgId } : {}),
					subRole: subRole,
				},
			});

			const userResponse = {
				id: user.id,
				email: user.email,
				userName: user.userName,
				avatar: user.avatar,
				role: (user as any).role,
				...((user as any).subRole ? { subRole: (user as any).subRole } : {}),
			};

			logActivity(req, {
				userId: user.id,
				action: config.ACTIVITY_LOG.USER.ACTIONS.REGISTER,
				description: `${config.ACTIVITY_LOG.USER.DESCRIPTIONS.USER_REGISTERED}: ${email}`,
				page: { url: req.originalUrl, title: "Registration Page" },
			});

			logAudit(req, {
				userId: user.id,
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.USERS,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: user.id,
				changesBefore: null,
				changesAfter: {
					email: user.email,
					userName: user.userName,
				},
				description: `${config.AUDIT_LOG.USER.DESCRIPTIONS.CREATED}: ${email}`,
			});

			authLogger.info(`${config.SUCCESS.AUTH.USER_CREATED}: ${user.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUTH.REGISTRATION_SUCCESSFUL,
				{ result: userResponse },
				201,
			);

			res.status(201).json(successResponse);
		} catch (error: any) {
			authLogger.error(`Error during registration: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const login = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = LoginSchema.safeParse(req.body);
		if (!validationResult.success) {
			const formattedErrors = formatZodErrors(validationResult.error);
			authLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);

			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}
		const { identifier, password } = validationResult.data;

		authLogger.info(`${config.INFO.USER.LOGGING_IN_USER}: ${identifier}`);

		try {
			const user = await prisma.user.findFirst({
				where: {
					OR: [{ email: identifier }, { userName: identifier }],
				},
				include: { person: true, organization: true },
			});
			if (!user || !user.password) {
				authLogger.error(`Invalid credentials for identifier: ${identifier}`);
				const errorResponse = buildErrorResponse("Invalid credentials", 401, [
					{ field: "identifier", message: "Invalid username or email" },
				]);
				res.status(401).json(errorResponse);
				return;
			}

			const isPasswordValid = await argon2.verify(user.password, password);
			if (!isPasswordValid) {
				authLogger.error(`Invalid password for identifier: ${identifier}`);
				const errorResponse = buildErrorResponse("Invalid credentials", 401, [
					{ field: "password", message: "Invalid password" },
				]);
				res.status(401).json(errorResponse);
				return;
			}

			const rawAuthType = (user as any)?.metaData?.authType as string | undefined;
			const authType =
				rawAuthType && rawAuthType in config.AUTH_CONFIG ? rawAuthType : "standard";
			const expiresIn = config.AUTH_CONFIG[authType as keyof typeof config.AUTH_CONFIG];

			await prisma.user.update({
				where: { id: user.id },
				data: { lastLogin: new Date() },
			});

			let token: string;
			const payload = {
				userId: user.id,
				firstName: user.person?.personalInfo?.firstName,
				lastName: user.person?.personalInfo?.lastName,
				role: user.role,
				orgId: user.orgId,
				orgCode: user.organization?.code,
				subRole: user.subRole,
			};
			const secret = process.env.JWT_SECRET || "";
			if (expiresIn) {
				token = jwt.sign(payload, secret, { expiresIn: expiresIn as any });
			} else {
				token = jwt.sign(payload, secret);
			}

			const isProduction = process.env.NODE_ENV === "production";
			res.cookie("token", token, {
				httpOnly: true,
				secure: isProduction,
				sameSite: isProduction ? "none" : "lax",
				maxAge: authType === "persistent" ? undefined : 1 * 24 * 60 * 60 * 1000,
				path: "/",
			});

			authLogger.info(`${config.SUCCESS.AUTH.USER_LOGGED_IN}: ${user.id}`);

			const { password: _, ...userWithoutPassword } = user;
			const successResponse = buildSuccessResponse(
				"Logged in successfully",
				{
					user: userWithoutPassword,
					token,
				},
				200,
			);
			res.status(200).json(successResponse);

			logActivity(req, {
				userId: user.id,
				action: "LOGIN",
				description: `User ${identifier} logged in`,
				page: { url: req.originalUrl, title: "Login Page" },
			});
		} catch (error: any) {
			authLogger.error(`Error during login: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const updatePassword = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = UpdatePasswordSchema.safeParse(req.body);
		if (!validationResult.success) {
			const formattedErrors = formatZodErrors(validationResult.error);
			authLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);

			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}
		const { userId, password } = validationResult.data;

		try {
			const existingUser = await prisma.user.findUnique({
				where: { id: userId },
				include: { person: true },
			});
			const previousPassword = existingUser?.password;
			if (!existingUser) {
				authLogger.error(`User not found for userId: ${userId}`);
				const errorResponse = buildErrorResponse("Invalid user", 404, [
					{ field: "user", message: "User not found or no password set" },
				]);
				res.status(404).json(errorResponse);
				return;
			}

			const hashedPassword = await argon2.hash(password);
			await prisma.user.update({
				where: { id: userId },
				data: { password: hashedPassword },
			});

			logActivity(req, {
				userId,
				action: "UPDATE_PASSWORD",
				description: "User updated their password",
				page: { url: req.originalUrl, title: "Password Update Page" },
			});
			logAudit(req, {
				userId,
				action: "UPDATE",
				resource: "users",
				severity: "HIGH",
				entityType: "user",
				entityId: userId,
				changesBefore: { password: previousPassword },
				changesAfter: { password: hashedPassword },
				description: "User password updated",
			});

			authLogger.info(`${config.SUCCESS.AUTH.PASSWORD_UPDATED_SUCCESSFULLY}: ${userId}`);

			const successResponse = buildSuccessResponse(
				"Password updated successfully",
				{ success: true },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			authLogger.error(`Error during password update: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	const logout = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const isProduction = process.env.NODE_ENV === "production";

			res.cookie("token", "", {
				httpOnly: true,
				secure: isProduction,
				sameSite: isProduction ? "none" : "lax",
				maxAge: 0,
				path: "/",
			});

			logActivity(req, {
				userId: (req as any).user?.id || config.DEFAULT_UNKNOWN_USER_ID,
				action: "LOGOUT",
				description: "User logged out",
				page: { url: req.originalUrl, title: "Logout Endpoint" },
			});

			authLogger.info("User logged out successfully");
			const successResponse = buildSuccessResponse(
				"Logged out successfully",
				{ success: true },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			authLogger.error(`Error during logout: ${error}`);
			const errorResponse = handlePrismaError(error);
			res.status(errorResponse.code).json(errorResponse);
		}
	};

	return { register, login, updatePassword, logout };
};
