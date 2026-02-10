import express, { Router } from "express";
import { controller } from "./deliveryReceipt.controller";
import { router } from "./deliveryReceipt.router";
import { PrismaClient } from "../../generated/prisma";

export const deliveryReceiptModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = deliveryReceiptModule;
