import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { AppError } from "../errors/app-error.js";
import { AuthService } from "../auth/auth.service.js";
import { PasswordHasher } from "../auth/password-hasher.js";
import { TokenService } from "../auth/token.service.js";
import { registerSchema } from "../auth/auth.validation.js";
import { ProfileController } from "../controllers/profile.controller.js";
import { AuthController } from "../controllers/auth.controller.js";
import { AuthenticationMiddleware } from "../middleware/authentication.js";
import type { AuthSessionRepository } from "../repositories/auth-session.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { Request, Response } from "express";

const secret = "unit-test-secret-that-is-at-least-thirty-two-bytes";
const userRecord = {
  id: "5e9d9ee6-5c20-4cc4-bdbf-8ecc112589c5",
  email: "member@example.test",
  passwordHash: "stored-hash",
  displayName: "Member",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function createAuthHarness(options: { existingUser?: typeof userRecord | null } = {}) {
  const storedSessions = new Map<string, { userId: string; expiresAt: Date; revokedAt?: Date }>();
  const users = {
    findByEmail: async (email: string) => (email === userRecord.email ? options.existingUser ?? userRecord : null),
    create: async (data: { email: string; passwordHash: string; displayName: string }) => ({
      ...userRecord,
      ...data,
    }),
    findProfileById: async (id: string) => id === userRecord.id ? {
      id: userRecord.id,
      email: userRecord.email,
      displayName: userRecord.displayName,
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt,
    } : null,
    updateProfile: async (id: string, data: { displayName: string }) => ({
      id,
      email: userRecord.email,
      ...data,
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt,
    }),
  } as unknown as UserRepository;
  const sessions = {
    create: async (input: { tokenId: string; userId: string; expiresAt: Date }) => {
      storedSessions.set(input.tokenId, { userId: input.userId, expiresAt: input.expiresAt });
      return input;
    },
    findActive: async (tokenId: string, userId: string) => {
      const session = storedSessions.get(tokenId);
      return session && session.userId === userId && !session.revokedAt && session.expiresAt > new Date()
        ? { tokenId, userId, expiresAt: session.expiresAt }
        : null;
    },
    revoke: async (tokenId: string, userId: string) => {
      const session = storedSessions.get(tokenId);
      if (!session || session.userId !== userId || session.revokedAt) return false;
      session.revokedAt = new Date();
      return true;
    },
  } as unknown as AuthSessionRepository;
  const passwords = {
    hash: async (password: string) => `hashed:${password}`,
    verify: async (password: string, hash: string) =>
      hash === `hashed:${password}` || (hash === "stored-hash" && password === "correct-password"),
  } as unknown as PasswordHasher;
  const tokens = new TokenService(secret, 900);
  return { auth: new AuthService(users, sessions, passwords, tokens), users, sessions, storedSessions, tokens };
}

test("registration normalizes email, hashes password, and omits credential fields", async () => {
  const harness = createAuthHarness({ existingUser: null });
  let created: unknown;
  (harness.users as unknown as { create: (input: unknown) => Promise<unknown> }).create = async (input) => {
    created = input;
    return { ...userRecord, ...(input as object) };
  };

  const profile = await harness.auth.register({
    email: "  NEW@Example.Test ",
    password: "a-long-password-123",
    displayName: "  New Member  ",
  });

  assert.deepEqual(created, {
    email: "new@example.test",
    passwordHash: "hashed:a-long-password-123",
    displayName: "New Member",
  });
  assert.equal("passwordHash" in profile, false);
  assert.equal(profile.email, "new@example.test");
});

test("registration rejects duplicate email with conflict", async () => {
  const harness = createAuthHarness();
  await assert.rejects(
    harness.auth.register({ email: "MEMBER@example.test", password: "a-long-password-123", displayName: "Member" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
});

test("login issues a verifiable session and logout immediately revokes it", async () => {
  const harness = createAuthHarness();
  const result = await harness.auth.login(" MEMBER@example.test ", "correct-password");
  const principal = await harness.auth.authenticate(result.accessToken);

  assert.equal(result.tokenType, "Bearer");
  assert.equal(result.user.email, userRecord.email);
  assert.equal("passwordHash" in result.user, false);
  assert.equal(harness.storedSessions.has(principal.tokenId), true);

  await harness.auth.logout(principal);
  await assert.rejects(harness.auth.authenticate(result.accessToken), (error: unknown) =>
    error instanceof AppError && error.statusCode === 401,
  );
});

test("invalid and unknown credentials share the same unauthorized response", async () => {
  const harness = createAuthHarness();

  await assert.rejects(harness.auth.login(userRecord.email, "wrong-password"), (error: unknown) =>
    error instanceof AppError && error.statusCode === 401 && error.message === "Email or password is incorrect",
  );
  await assert.rejects(harness.auth.login("unknown@example.test", "wrong-password"), (error: unknown) =>
    error instanceof AppError && error.statusCode === 401 && error.message === "Email or password is incorrect",
  );
});

test("expired JWTs are rejected", async () => {
  const tokens = new TokenService(secret, 900);
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("taskmaster-api")
    .setAudience("taskmaster-api")
    .setSubject(userRecord.id)
    .setJti("0b79a7f3-488a-43e2-a316-1c26d8ebc646")
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(new TextEncoder().encode(secret));

  await assert.rejects(tokens.verify(expired), (error: unknown) => error instanceof AppError && error.statusCode === 401);
});

test("registration validation enforces email and bcrypt-safe password limits", () => {
  assert.equal(registerSchema.safeParse({
    email: "not-an-email",
    password: "tiny",
    displayName: "Member",
  }).success, false);
  assert.equal(registerSchema.safeParse({
    email: "member@example.test",
    password: "😀".repeat(19),
    displayName: "Member",
  }).success, false);
  assert.equal(registerSchema.safeParse({
    email: "member@example.test",
    password: "a-valid-password-123",
    displayName: "Member",
  }).success, true);
});

test("auth controller validates registration and returns a safe profile", async () => {
  let createdInput: unknown;
  const auth = {
    register: async (input: unknown) => {
      createdInput = input;
      return { id: "user-id", email: "member@example.test", displayName: "Member" };
    },
  } as unknown as AuthService;
  const controller = new AuthController(auth);
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;

  await controller.register({
    body: { email: " MEMBER@example.test ", password: "a-valid-password-123", displayName: " Member " },
  } as Request, response, () => undefined);

  assert.deepEqual(createdInput, {
    email: "member@example.test",
    password: "a-valid-password-123",
    displayName: "Member",
  });
  assert.equal(statusCode, 201);
  assert.deepEqual(body, {
    success: true,
    data: { user: { id: "user-id", email: "member@example.test", displayName: "Member" } },
  });
});

test("auth controller rejects malformed registration payloads", async () => {
  const controller = new AuthController({
    register: async () => { throw new Error("must not register"); },
  } as unknown as AuthService);
  const response = { status() { return this; }, json() { return this; } } as unknown as Response;

  await assert.rejects(async () => controller.register({
    body: { email: "invalid", password: "short", displayName: "" },
  } as Request, response, () => undefined), (error: unknown) =>
    error instanceof AppError && error.statusCode === 400 && error.code === "VALIDATION_ERROR",
  );
});

test("profile controller only updates the authenticated user's profile", async () => {
  const harness = createAuthHarness();
  const controller = new ProfileController(harness.auth);
  let body: unknown;
  const response = {
    status() { return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;

  await controller.update({
    auth: { userId: userRecord.id, tokenId: "session-id", expiresAt: new Date(Date.now() + 60_000) },
    body: { displayName: "Updated Name" },
  } as Request, response, () => undefined);

  assert.deepEqual(body, {
    success: true,
    data: { user: {
      id: userRecord.id,
      email: userRecord.email,
      displayName: "Updated Name",
      createdAt: userRecord.createdAt,
      updatedAt: userRecord.updatedAt,
    } },
  });
});

test("profile update rejects attempts to select another user", async () => {
  const harness = createAuthHarness();
  const controller = new ProfileController(harness.auth);
  const response = { status() { return this; }, json() { return this; } } as unknown as Response;

  await assert.rejects(async () => controller.update({
      auth: { userId: userRecord.id, tokenId: "session-id", expiresAt: new Date(Date.now() + 60_000) },
      body: { userId: "other-user", displayName: "Updated Name" },
    } as Request, response, () => undefined), (error: unknown) =>
    error instanceof AppError && error.statusCode === 400,
  );
});

test("authentication middleware rejects requests without a bearer token", async () => {
  let forwardedError: unknown;
  const middleware = new AuthenticationMiddleware({
    authenticate: async () => { throw new Error("should not be reached"); },
  } as unknown as AuthService);

  await middleware.authenticate({ get: () => undefined } as unknown as Request, {} as Response, (error) => {
    forwardedError = error;
  });

  assert.ok(forwardedError instanceof AppError);
  assert.equal(forwardedError.statusCode, 401);
});

test("authentication middleware attaches the verified principal", async () => {
  const principal = {
    userId: userRecord.id,
    tokenId: "session-id",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const middleware = new AuthenticationMiddleware({
    authenticate: async (token: string) => {
      assert.equal(token, "valid-token");
      return principal;
    },
  } as unknown as AuthService);
  const request = { get: () => "Bearer valid-token" } as unknown as Request;
  let forwardedError: unknown;

  await middleware.authenticate(request, {} as Response, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, undefined);
  assert.deepEqual(request.auth, principal);
});

test("password hasher stores a one-way hash and verifies credentials", async () => {
  const hasher = new PasswordHasher(4);
  const hash = await hasher.hash("correct horse battery staple");

  assert.notEqual(hash, "correct horse battery staple");
  assert.equal(await hasher.verify("correct horse battery staple", hash), true);
  assert.equal(await hasher.verify("incorrect password", hash), false);
});
