import { Router, Request, Response, NextFunction } from "express";

interface IController {
	register(req: Request, res: Response, next: NextFunction): Promise<void>;
	login(req: Request, res: Response, next: NextFunction): Promise<void>;
	logout(req: Request, res: Response, next: NextFunction): Promise<void>;
	updatePassword(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/auth";

	/**
	 * @openapi
	 * components:
	 *   schemas:
	 *     RegisterRequest:
	 *       type: object
	 *       required:
	 *         - email
	 *         - password
	 *         - userName
	 *         - role
	 *         - firstName
	 *         - lastName
	 *       properties:
	 *         email:
	 *           type: string
	 *           format: email
	 *           description: User email address
	 *         password:
	 *           type: string
	 *           minLength: 6
	 *           description: Password (minimum 6 characters)
	 *         userName:
	 *           type: string
	 *           minLength: 3
	 *           maxLength: 50
	 *           pattern: '^[a-zA-Z0-9_-]+$'
	 *           description: Username (letters, numbers, underscores, hyphens only)
	 *         role:
	 *           type: string
	 *           enum: [superadmin, viewer, admin, guest]
	 *           description: User role
	 *         subRole:
	 *           type: string
	 *           enum: [staff, guard, vendor, operator, manager, guest]
	 *           description: User sub-role (optional)
	 *         firstName:
	 *           type: string
	 *           minLength: 1
	 *           description: First name
	 *         lastName:
	 *           type: string
	 *           minLength: 1
	 *           description: Last name
	 *         organizationId:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *           description: Organization ID (MongoDB ObjectId)
	 *         phoneNumber:
	 *           type: string
	 *           description: Phone number
	 *         dateOfBirth:
	 *           type: string
	 *           format: date-time
	 *           description: Date of birth
	 *         gender:
	 *           type: string
	 *           enum: [male, female, other]
	 *           description: Gender
	 *         nationality:
	 *           type: string
	 *           description: Nationality
	 *         address:
	 *           type: object
	 *           properties:
	 *             street:
	 *               type: string
	 *             city:
	 *               type: string
	 *             state:
	 *               type: string
	 *             country:
	 *               type: string
	 *             postalCode:
	 *               type: string
	 *         personalInfo:
	 *           type: object
	 *           additionalProperties: true
	 *           description: Additional personal information
	 *         contactInfo:
	 *           type: object
	 *           additionalProperties: true
	 *           description: Contact information
	 *         identification:
	 *           type: object
	 *           additionalProperties: true
	 *           description: Identification documents
	 *     LoginRequest:
	 *       type: object
	 *       required:
	 *         - email
	 *         - password
	 *       properties:
	 *         email:
	 *           type: string
	 *           format: email
	 *           description: User email address
	 *         password:
	 *           type: string
	 *           minLength: 1
	 *           description: User password
	 *     UpdatePasswordRequest:
	 *       type: object
	 *       required:
	 *         - userId
	 *         - password
	 *       properties:
	 *         userId:
	 *           type: string
	 *           pattern: '^[0-9a-fA-F]{24}$'
	 *           description: User ID (MongoDB ObjectId)
	 *         password:
	 *           type: string
	 *           minLength: 6
	 *           description: New password (minimum 6 characters)
	 *     AuthUser:
	 *       type: object
	 *       properties:
	 *         id:
	 *           type: string
	 *           description: User ID
	 *         email:
	 *           type: string
	 *           description: User email
	 *         userName:
	 *           type: string
	 *           description: Username
	 *         role:
	 *           type: string
	 *           description: User role
	 *         subRole:
	 *           type: string
	 *           nullable: true
	 *           description: User sub-role
	 *         avatar:
	 *           type: string
	 *           nullable: true
	 *           description: Avatar URL
	 *         person:
	 *           type: object
	 *           description: Associated person data
	 *         token:
	 *           type: string
	 *           description: JWT authentication token (only in login response)
	 */

	/**
	 * @openapi
	 * /api/auth/register:
	 *   post:
	 *     summary: Register a new user
	 *     description: Register a new user with person details and authentication credentials
	 *     tags: [Auth]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/RegisterRequest'
	 *     responses:
	 *       201:
	 *         description: User registered successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                   example: true
	 *                 message:
	 *                   type: string
	 *                   example: "Registration successful"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     result:
	 *                       $ref: '#/components/schemas/AuthUser'
	 *       400:
	 *         description: Validation error or user already exists
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/register", controller.register);

	/**
	 * @openapi
	 * /api/auth/login:
	 *   post:
	 *     summary: Login user
	 *     description: Authenticate user and return JWT token
	 *     tags: [Auth]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/LoginRequest'
	 *     responses:
	 *       200:
	 *         description: Login successful
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                   example: true
	 *                 message:
	 *                   type: string
	 *                   example: "Logged in successfully"
	 *                 data:
	 *                   $ref: '#/components/schemas/AuthUser'
	 *         headers:
	 *           Set-Cookie:
	 *             description: JWT token set as HTTP-only cookie
	 *             schema:
	 *               type: string
	 *               example: "token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Path=/"
	 *       401:
	 *         description: Invalid credentials
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/login", controller.login);

	/**
	 * @openapi
	 * /api/auth/logout:
	 *   post:
	 *     summary: Logout user
	 *     description: Logout user and clear JWT token cookie
	 *     tags: [Auth]
	 *     security:
	 *       - cookieAuth: []
	 *     responses:
	 *       200:
	 *         description: Successfully logged out
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                   example: true
	 *                 message:
	 *                   type: string
	 *                   example: "Logged out successfully"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     success:
	 *                       type: boolean
	 *                       example: true
	 *         headers:
	 *           Set-Cookie:
	 *             description: JWT token cookie cleared
	 *             schema:
	 *               type: string
	 *               example: "token=; HttpOnly; Path=/; Max-Age=0"
	 *       500:
	 *         description: Internal server error
	 */
	routes.post("/logout", controller.logout);

	/**
	 * @openapi
	 * /api/auth/update-password:
	 *   put:
	 *     summary: Update user password
	 *     description: Update a user's password by user ID
	 *     tags: [Auth]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/UpdatePasswordRequest'
	 *     responses:
	 *       200:
	 *         description: Password updated successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                   example: true
	 *                 message:
	 *                   type: string
	 *                   example: "Password updated successfully"
	 *                 data:
	 *                   type: object
	 *                   properties:
	 *                     success:
	 *                       type: boolean
	 *                       example: true
	 *       400:
	 *         description: Validation error
	 *       404:
	 *         description: User not found
	 *       500:
	 *         description: Internal server error
	 */
	routes.put("/update-password", controller.updatePassword);

	route.use(path, routes);

	return route;
};
