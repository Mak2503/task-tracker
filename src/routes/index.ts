import { Router } from "express";
import { healthCheck } from "../controllers/health.controller.js";
import { DatabaseHealthController } from "../controllers/database-health.controller.js";
import { DatabaseService } from "../database/database.service.js";
import { prismaClient } from "../database/prisma-client.js";
import {
  authController,
  authenticationMiddleware,
  profileController,
  projectController,
  taskController,
  commentController,
  attachmentController,
  notificationController,
} from "../container.js";

const router = Router();

router.get("/health", healthCheck);
router.get("/health/ready", new DatabaseHealthController(new DatabaseService(prismaClient)).check);
router.post("/auth/register", authController.register);
router.post("/auth/login", authController.login);
router.post("/auth/logout", authenticationMiddleware.authenticate, authController.logout);
router.get("/notifications/events", authenticationMiddleware.authenticate, notificationController.stream);
router.get("/users/me", authenticationMiddleware.authenticate, profileController.get);
router.patch("/users/me", authenticationMiddleware.authenticate, profileController.update);
router.post("/projects", authenticationMiddleware.authenticate, projectController.create);
router.get("/projects", authenticationMiddleware.authenticate, projectController.list);
router.get("/projects/:projectId", authenticationMiddleware.authenticate, projectController.get);
router.patch("/projects/:projectId", authenticationMiddleware.authenticate, projectController.update);
router.delete("/projects/:projectId", authenticationMiddleware.authenticate, projectController.archive);
router.get("/projects/:projectId/members", authenticationMiddleware.authenticate, projectController.listMembers);
router.patch("/projects/:projectId/members/:userId", authenticationMiddleware.authenticate, projectController.updateMemberRole);
router.delete("/projects/:projectId/members/:userId", authenticationMiddleware.authenticate, projectController.removeMember);
router.post("/projects/:projectId/invitations", authenticationMiddleware.authenticate, projectController.invite);
router.get("/projects/:projectId/invitations", authenticationMiddleware.authenticate, projectController.listInvitations);
router.delete("/projects/:projectId/invitations/:invitationId", authenticationMiddleware.authenticate, projectController.revokeInvitation);
router.post("/invitations/:token/accept", authenticationMiddleware.authenticate, projectController.acceptInvitation);
router.get("/tasks/assigned-to-me", authenticationMiddleware.authenticate, taskController.listAssignedToMe);
router.post("/projects/:projectId/tasks", authenticationMiddleware.authenticate, taskController.create);
router.get("/projects/:projectId/tasks", authenticationMiddleware.authenticate, taskController.listForProject);
router.get("/projects/:projectId/tasks/:taskId", authenticationMiddleware.authenticate, taskController.get);
router.patch("/projects/:projectId/tasks/:taskId", authenticationMiddleware.authenticate, taskController.update);
router.delete("/projects/:projectId/tasks/:taskId", authenticationMiddleware.authenticate, taskController.archive);
router.post("/projects/:projectId/tasks/:taskId/comments", authenticationMiddleware.authenticate, commentController.create);
router.get("/projects/:projectId/tasks/:taskId/comments", authenticationMiddleware.authenticate, commentController.list);
router.patch("/projects/:projectId/tasks/:taskId/comments/:commentId", authenticationMiddleware.authenticate, commentController.update);
router.delete("/projects/:projectId/tasks/:taskId/comments/:commentId", authenticationMiddleware.authenticate, commentController.delete);
router.post("/projects/:projectId/tasks/:taskId/attachments", authenticationMiddleware.authenticate, attachmentController.createUpload);
router.get("/projects/:projectId/tasks/:taskId/attachments", authenticationMiddleware.authenticate, attachmentController.list);
router.post("/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete", authenticationMiddleware.authenticate, attachmentController.complete);
router.get("/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download", authenticationMiddleware.authenticate, attachmentController.download);
router.delete("/projects/:projectId/tasks/:taskId/attachments/:attachmentId", authenticationMiddleware.authenticate, attachmentController.delete);

export default router;
