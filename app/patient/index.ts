import express, { Router } from "express";
import { controller } from "./patient.controller";
import { router } from "./patient.router";
import { PrismaClient } from "../../generated/prisma";

export const patientModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = patientModule;
