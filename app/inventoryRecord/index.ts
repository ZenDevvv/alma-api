import express, { Router } from "express";
import { controller } from "./stock-record.controller";
import { router } from "./stock-record.router";
import { PrismaClient } from "../../generated/prisma";

export const stockRecordModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = stockRecordModule;
