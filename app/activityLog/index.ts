import express, { Router } from "express";
import { controller } from "./activityLog.controller";
import { router } from "./activityLog.router";
import { PrismaClient } from "../../generated/prisma";

export const activityLogModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = activityLogModule;
