import { AppError } from "../errors/app-error.js";
import { AuthSessionRepository } from "../repositories/auth-session.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { PasswordHasher } from "./password-hasher.js";
import { TokenService, type AuthenticatedPrincipal } from "./token.service.js";

export type RegisterInput = { email: string; password: string; displayName: string };

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: AuthSessionRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new AppError("An account with this email already exists", 409, "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await this.passwords.hash(input.password);
    let user;
    try {
      user = await this.users.create({ email, passwordHash, displayName: input.displayName.trim() });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError("An account with this email already exists", 409, "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }

    return this.toProfile(user);
  }

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user) {
      await this.passwords.hash(password);
      throw this.invalidCredentials();
    }
    if (!(await this.passwords.verify(password, user.passwordHash))) {
      throw this.invalidCredentials();
    }

    const issued = await this.tokens.issue(user.id);
    await this.sessions.create({
      tokenId: issued.principal.tokenId,
      userId: user.id,
      expiresAt: issued.principal.expiresAt,
    });

    return {
      accessToken: issued.token,
      tokenType: "Bearer" as const,
      expiresAt: issued.principal.expiresAt.toISOString(),
      user: this.toProfile(user),
    };
  }

  async authenticate(token: string): Promise<AuthenticatedPrincipal> {
    const principal = await this.tokens.verify(token);
    const activeSession = await this.sessions.findActive(principal.tokenId, principal.userId);
    if (!activeSession) {
      throw new AppError("The access token is invalid or expired", 401, "INVALID_TOKEN");
    }
    return principal;
  }

  async logout(principal: AuthenticatedPrincipal): Promise<void> {
    await this.sessions.revoke(principal.tokenId, principal.userId);
  }

  async getProfile(userId: string) {
    const profile = await this.users.findProfileById(userId);
    if (!profile) {
      throw new AppError("User profile was not found", 404, "USER_NOT_FOUND");
    }
    return profile;
  }

  async updateProfile(userId: string, displayName: string) {
    const profile = await this.users.findProfileById(userId);
    if (!profile) {
      throw new AppError("User profile was not found", 404, "USER_NOT_FOUND");
    }
    return this.users.updateProfile(userId, { displayName: displayName.trim() });
  }

  private invalidCredentials(): AppError {
    return new AppError("Email or password is incorrect", 401, "INVALID_CREDENTIALS");
  }

  private toProfile(user: { id: string; email: string; displayName: string; createdAt: Date; updatedAt: Date }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
