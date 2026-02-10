import express, { Router } from "express";
import { controller } from "./auditLog.controller";
import { router } from "./auditLog.router";
import { PrismaClient } from "../../generated/prisma";

export const auditLogModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = auditLogModule;
