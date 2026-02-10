import express, { Router } from "express";
import { controller } from "./batch.controller";
import { router } from "./batch.router";
import { PrismaClient } from "../../generated/prisma";

export const batchModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = batchModule;
