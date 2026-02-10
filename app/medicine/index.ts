import express, { Router } from "express";
import { controller } from "./medicine.controller";
import { router } from "./medicine.router";
import { PrismaClient } from "../../generated/prisma";

export const medicineModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = medicineModule;
