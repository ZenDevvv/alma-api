import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/prisma";

enum Role {
	ADMIN = "admin",
	USER = "user",
	VIEWER = "viewer",
}

export interface AuthRequest extends Request {
	role: Role;
	subRole: string[];
	userId: string;
	firstName: string;
	lastName: string;
	orgCode?: string;
	orgId?: string;
}

interface JwtPayload {
	userId: string;
	role: Role;
	subRole: string[];
	firstName: string;
	lastName: string;
	orgId?: string;
	orgCode?: string;
}

const prisma = new PrismaClient();

export default async (req: AuthRequest, res: Response, next: NextFunction) => {
	const token = req.cookies.token;

	if (!token) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
		// Prefer claims from token
		req.userId = decoded.userId;
		req.role = decoded.role;
		req.subRole = decoded.subRole;
		req.firstName = decoded.firstName;
		req.lastName = decoded.lastName;
		req.orgId = decoded.orgId;
		req.orgCode = decoded.orgCode;


		// Fallback: fetch missing fields from DB
		if (!req.role || !req.subRole || req.subRole.length === 0) {
			if (!req.userId) {
				res.status(401).json({ message: "Unauthorized" });
				return;
			}
			const user = await prisma.user.findUnique({
				where: { id: req.userId },
			select: { role: true, subRole: true, orgId: true },
			});
			if (!user) {
				res.status(401).json({ message: "Unauthorized" });
				return;
			}
			// Assign fallbacks if missing
			req.role = req.role || (user.role as Role);
			req.subRole = req.subRole?.length ? req.subRole : (user.subRole as string[]);
			req.orgId = req.orgId || (user.orgId as string);
			// Note: firstName/lastName not stored on User; skip enrichment
		}


		next();
	} catch (error: any) {
		res.status(401).json({ message: error.message });
	}
};
