import { prismaClient } from "./database/prisma-client.js";
import { UserRepository } from "./repositories/user.repository.js";
import { AuthSessionRepository } from "./repositories/auth-session.repository.js";
import { PasswordHasher } from "./auth/password-hasher.js";
import { TokenService } from "./auth/token.service.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthenticationMiddleware } from "./middleware/authentication.js";
import { AuthController } from "./controllers/auth.controller.js";
import { ProfileController } from "./controllers/profile.controller.js";
import { ProjectRepository } from "./repositories/project.repository.js";
import { ProjectMembershipRepository } from "./repositories/project-membership.repository.js";
import { ProjectInvitationRepository } from "./repositories/project-invitation.repository.js";
import { ProjectService } from "./projects/project.service.js";
import { ProjectController } from "./controllers/project.controller.js";
import { TaskRepository } from "./repositories/task.repository.js";
import { TaskService } from "./tasks/task.service.js";
import { TaskController } from "./controllers/task.controller.js";
import { CommentRepository } from "./repositories/comment.repository.js";
import { CommentService } from "./comments/comment.service.js";
import { CommentController } from "./controllers/comment.controller.js";
import { AttachmentRepository } from "./repositories/attachment.repository.js";
import { AttachmentService } from "./attachments/attachment.service.js";
import { AttachmentController } from "./controllers/attachment.controller.js";
import { S3ObjectStorage } from "./storage/object-storage.js";
import { SseEventHub } from "./notifications/sse-event-hub.js";
import { NotificationController } from "./controllers/notification.controller.js";

const userRepository = new UserRepository(prismaClient);
const sessionRepository = new AuthSessionRepository(prismaClient);
export const tokenService = new TokenService();
export const authService = new AuthService(
  userRepository,
  sessionRepository,
  new PasswordHasher(),
  tokenService,
);
export const authenticationMiddleware = new AuthenticationMiddleware(authService);
export const authController = new AuthController(authService);
export const profileController = new ProfileController(authService);
export const projectService = new ProjectService(
  new ProjectRepository(prismaClient),
  new ProjectMembershipRepository(prismaClient),
  new ProjectInvitationRepository(prismaClient),
  userRepository,
);
export const projectController = new ProjectController(projectService);
export const taskService = new TaskService(
  new TaskRepository(prismaClient),
  new ProjectRepository(prismaClient),
  new ProjectMembershipRepository(prismaClient),
);
const memberships = new ProjectMembershipRepository(prismaClient);
export const eventHub = new SseEventHub();
export const notificationController = new NotificationController(eventHub);
export const taskController = new TaskController(taskService, memberships, eventHub);
export const commentController = new CommentController(new CommentService(
  new CommentRepository(prismaClient),
  taskService,
  memberships,
));
export const attachmentController = new AttachmentController(new AttachmentService(
  new AttachmentRepository(prismaClient),
  taskService,
  memberships,
  new S3ObjectStorage(),
));
