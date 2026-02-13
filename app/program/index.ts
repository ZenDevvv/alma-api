import express, { Router } from "express";
import { controller } from "./program.controller";
import { router } from "./program.router";
import { PrismaClient } from "../../generated/prisma";

export const programModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
