import express, { Router } from "express";
import { controller } from "./deliveryReceiptItem.controller";
import { router } from "./deliveryReceiptItem.router";
import { PrismaClient } from "../../generated/prisma";

export const deliveryReceiptItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = deliveryReceiptItemModule;
