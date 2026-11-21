import { Router } from "express";
import { healthCheck } from "../controllers/health.controller.js";
import { DatabaseHealthController } from "../controllers/database-health.controller.js";
import { DatabaseService } from "../database/database.service.js";
import { prismaClient } from "../database/prisma-client.js";
import { authController, authenticationMiddleware, profileController } from "../container.js";

const router = Router();

router.get("/health", healthCheck);
router.get("/health/ready", new DatabaseHealthController(new DatabaseService(prismaClient)).check);
router.post("/auth/register", authController.register);
router.post("/auth/login", authController.login);
router.post("/auth/logout", authenticationMiddleware.authenticate, authController.logout);
router.get("/users/me", authenticationMiddleware.authenticate, profileController.get);
router.patch("/users/me", authenticationMiddleware.authenticate, profileController.update);

export default router;
