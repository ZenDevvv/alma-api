import express, { Router } from "express";
import { router } from "./delivery-request.router";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./delivery-request.controller";

export const deliveryModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = deliveryModule;
