import express, { Router } from "express";
import { controller } from "./approval.controller";
import { router } from "./approval.router";
import { PrismaClient } from "../../generated/prisma";

export const approvalModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = approvalModule;
