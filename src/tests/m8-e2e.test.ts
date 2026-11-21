import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";
import app from "../app.js";
import { env } from "../config/env.js";
import { prismaClient } from "../database/prisma-client.js";

const enabled = process.env.TASKMASTER_E2E === "1";
const parsedDatabaseUrl = new URL(env.DATABASE_URL);
if (enabled && (!["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname)
  || parsedDatabaseUrl.pathname !== "/postgres")) {
  throw new Error("M8 E2E tests only run against a local database named postgres; use a disposable local instance");
}

let server: ReturnType<typeof app.listen> | undefined;
let baseUrl: string;
const createdUserIds: string[] = [];
let projectId: string | undefined;

before(async () => {
  if (!enabled) return;
  await prismaClient.$connect();
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.once("listening", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
});

after(async () => {
  if (projectId) await prismaClient.project.deleteMany({ where: { id: projectId } });
  if (createdUserIds.length) await prismaClient.user.deleteMany({ where: { id: { in: createdUserIds } } });
  if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
  if (enabled) await prismaClient.$disconnect();
});

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = response.status === 204 ? undefined : await response.json() as Record<string, any>;
  return { response, payload };
}

test("documented account-to-project-task collaboration workflow works end to end", { skip: !enabled }, async () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerEmail = `m8-owner-${unique}@example.test`;
  const memberEmail = `m8-member-${unique}@example.test`;
  const password = "m8-e2e-Strong-password";

  const ownerRegistration = await request("/api/auth/register", {
    method: "POST", body: { email: ownerEmail, password, displayName: "Milestone Owner" },
  });
  assert.equal(ownerRegistration.response.status, 201);
  createdUserIds.push(ownerRegistration.payload!.data.user.id);

  const memberRegistration = await request("/api/auth/register", {
    method: "POST", body: { email: memberEmail, password, displayName: "Milestone Member" },
  });
  assert.equal(memberRegistration.response.status, 201);
  createdUserIds.push(memberRegistration.payload!.data.user.id);

  const ownerLogin = await request("/api/auth/login", { method: "POST", body: { email: ownerEmail, password } });
  const memberLogin = await request("/api/auth/login", { method: "POST", body: { email: memberEmail, password } });
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(memberLogin.response.status, 200);
  const ownerToken = ownerLogin.payload!.data.accessToken as string;
  const memberToken = memberLogin.payload!.data.accessToken as string;

  const profile = await request("/api/users/me", { token: memberToken, method: "PATCH", body: { displayName: "Updated Member" } });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload!.data.user.displayName, "Updated Member");

  const project = await request("/api/projects", {
    token: ownerToken, method: "POST", body: { name: `M8 workflow ${unique}`, description: "E2E project" },
  });
  assert.equal(project.response.status, 201);
  projectId = project.payload!.data.project.id as string;

  const invitation = await request(`/api/projects/${projectId}/invitations`, {
    token: ownerToken, method: "POST", body: { email: memberEmail },
  });
  assert.equal(invitation.response.status, 201);
  const invitationToken = invitation.payload!.data.invitation.token as string;
  const acceptance = await request(`/api/invitations/${invitationToken}/accept`, { token: memberToken, method: "POST" });
  assert.equal(acceptance.response.status, 200);

  const task = await request(`/api/projects/${projectId}/tasks`, {
    token: ownerToken,
    method: "POST",
    body: { title: "E2E task", description: "Follow the documented workflow", assigneeId: createdUserIds[1] },
  });
  assert.equal(task.response.status, 201);
  const taskId = task.payload!.data.task.id as string;

  const assigned = await request("/api/tasks/assigned-to-me?search=E2E", { token: memberToken });
  assert.equal(assigned.response.status, 200);
  assert.ok(assigned.payload!.data.tasks.some((entry: { id: string }) => entry.id === taskId));

  const comment = await request(`/api/projects/${projectId}/tasks/${taskId}/comments`, {
    token: memberToken, method: "POST", body: { body: "I have started this task." },
  });
  assert.equal(comment.response.status, 201);
  const comments = await request(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token: ownerToken });
  assert.equal(comments.response.status, 200);
  assert.equal(comments.payload!.data.comments.length, 1);

  const completed = await request(`/api/projects/${projectId}/tasks/${taskId}`, {
    token: memberToken, method: "PATCH", body: { status: "COMPLETED" },
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.payload!.data.task.status, "COMPLETED");

  const logout = await request("/api/auth/logout", { token: memberToken, method: "POST" });
  assert.equal(logout.response.status, 204);
  const revoked = await request("/api/users/me", { token: memberToken });
  assert.equal(revoked.response.status, 401);
});
