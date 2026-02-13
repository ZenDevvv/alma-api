import express, { Router } from "express";
import { controller } from "./course.controller";
import { router } from "./course.router";
import { PrismaClient } from "../../generated/prisma";

export const courseModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
