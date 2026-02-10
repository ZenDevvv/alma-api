import express, { Router } from "express";
import { controller } from "./supplierItem.controller";
import { router } from "./supplierItem.router";
import { PrismaClient } from "../../generated/prisma";

export const supplierItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = supplierItemModule;
