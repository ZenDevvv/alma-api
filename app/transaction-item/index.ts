import express, { Router } from "express";
import { controller } from "./transactionItem.controller";
import { router } from "./transactionItem.router";
import { PrismaClient } from "../../generated/prisma";

export const transactionItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = transactionItemModule;
