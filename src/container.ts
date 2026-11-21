import { prismaClient } from "./database/prisma-client.js";
import { UserRepository } from "./repositories/user.repository.js";
import { AuthSessionRepository } from "./repositories/auth-session.repository.js";
import { PasswordHasher } from "./auth/password-hasher.js";
import { TokenService } from "./auth/token.service.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthenticationMiddleware } from "./middleware/authentication.js";
import { AuthController } from "./controllers/auth.controller.js";
import { ProfileController } from "./controllers/profile.controller.js";

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
