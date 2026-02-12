import express, { Router } from "express";
import { controller } from "./faculty.controller";
import { router } from "./faculty.router";
import { PrismaClient } from "../../generated/prisma";

export const facultyModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};
