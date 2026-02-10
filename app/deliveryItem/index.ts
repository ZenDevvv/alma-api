import express, { Router } from "express";
import { controller } from "./deliveryItem.controller";
import { router } from "./deliveryItem.router";
import { PrismaClient } from "../../generated/prisma";

export const deliveryItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = deliveryItemModule;
