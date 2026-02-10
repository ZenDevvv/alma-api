import express, { Router } from "express";
import { controller } from "./deliveryOrderItem.controller";
import { router } from "./deliveryOrderItem.router";
import { PrismaClient } from "../../generated/prisma";

export const deliveryOrderItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = deliveryOrderItemModule;
