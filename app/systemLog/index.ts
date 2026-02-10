import express, { Router } from "express";
import { controller } from "./systemLog.controller";
import { router } from "./systemLog.router";
import { PrismaClient } from "../../generated/prisma";

export const systemLogModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
