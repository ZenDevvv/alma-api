import express, { Router } from "express";
import { controller } from "./alert.controller";
import { router } from "./alert.router";
import { PrismaClient } from "../../generated/prisma";

export const alertModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = alertModule;
