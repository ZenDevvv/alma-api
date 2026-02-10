import { Request, Response, NextFunction } from "express";

interface User {
	role: "admin" | "viewer" | "user";
}

interface AuthRequest extends Request {
	user: User;
}

type Action = "create" | "edit" | "delete" | "view";

interface RolePermissions {
	can: Action[];
}

type Roles = {
	[K in User["role"]]: RolePermissions;
};

const roles: Roles = {
	admin: {
		can: ["create", "edit", "delete", "view"],
	},
	user: {
		can: ["create", "edit", "view"],
	},
	viewer: {
		can: ["view"],
	},
};

const checkRole = (role: User["role"], action: Action) => {
	return (req: Request, res: Response, next: NextFunction): void => {
		const authReq = req as AuthRequest;
		const userRole = authReq.user.role;
		const permissions = roles[userRole].can;

		if (permissions.includes(action)) {
			next();
		} else {
			res.status(403).json({ message: "Access Denied" });
		}
	};
};

export default checkRole;
