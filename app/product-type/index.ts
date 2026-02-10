import express, { Router } from "express";
import { controller } from "./product-type.controller";
import { router } from "./product-type.router";
import { PrismaClient } from "../../generated/prisma";

export const subCategoryModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = subCategoryModule;
