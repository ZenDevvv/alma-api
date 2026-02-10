import express, { Router } from "express";
import { controller } from "./user.controller";
import { router } from "./user.router";
import { PrismaClient } from "../../generated/prisma";

export const userModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
