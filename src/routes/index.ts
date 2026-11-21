import { Router } from "express";
import { healthCheck } from "../controllers/health.controller.js";
import { DatabaseHealthController } from "../controllers/database-health.controller.js";
import { DatabaseService } from "../database/database.service.js";
import { prismaClient } from "../database/prisma-client.js";

const router = Router();

router.get("/health", healthCheck);
router.get("/health/ready", new DatabaseHealthController(new DatabaseService(prismaClient)).check);

export default router;
