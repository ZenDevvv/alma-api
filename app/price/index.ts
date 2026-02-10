import express, { Router } from "express";
import { controller } from "./price.controller";
import { router } from "./price.router";
import { PrismaClient } from "../../generated/prisma";

export const priceModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = priceModule;
