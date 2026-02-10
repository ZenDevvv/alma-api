import express, { Router } from "express";
import { controller } from "./stockMovementItem.controller";
import { router } from "./stockMovementItem.router";
import { PrismaClient } from "../../generated/prisma";

export const stockMovementItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = stockMovementItemModule;
