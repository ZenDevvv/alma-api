import express, { Router } from "express";
import { controller } from "./organization.controller";
import { router } from "./organization.router";
import { PrismaClient } from "../../generated/prisma";

export const organizationModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
