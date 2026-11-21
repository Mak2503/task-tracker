import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AttachmentRepository } from "../repositories/attachment.repository.js";
import { CommentRepository } from "../repositories/comment.repository.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { TaskRepository } from "../repositories/task.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { DatabaseService } from "../database/database.service.js";
import { DatabaseHealthController } from "../controllers/database-health.controller.js";
import type { Request, Response } from "express";

type Call = { model: string; method: string; args?: unknown };

function createRepositoryClient(calls: Call[]): PrismaClient {
  const spy = (model: string, method: string) => async (args?: unknown) => {
    calls.push({ model, method, args });
    return null;
  };

  return {
    user: { findUnique: spy("user", "findUnique") },
    project: {
      findUnique: spy("project", "findUnique"),
      findFirst: spy("project", "findFirst"),
      findMany: spy("project", "findMany"),
    },
    task: {
      findUnique: spy("task", "findUnique"),
      findMany: spy("task", "findMany"),
    },
    comment: { findMany: spy("comment", "findMany") },
    attachment: { findMany: spy("attachment", "findMany") },
  } as unknown as PrismaClient;
}

test("database service manages connections and reports query readiness", async () => {
  let connected = false;
  let disconnected = false;
  const client = {
    $connect: async () => { connected = true; },
    $disconnect: async () => { disconnected = true; },
    $queryRaw: async () => [{ result: 1 }],
  } as unknown as PrismaClient;
  const database = new DatabaseService(client);

  await database.connect();
  assert.equal(await database.isReady(), true);
  await database.disconnect();

  assert.equal(connected, true);
  assert.equal(disconnected, true);
});

test("database service reports unavailable when its readiness query fails", async () => {
  const client = {
    $queryRaw: async () => { throw new Error("connection refused"); },
  } as unknown as PrismaClient;

  assert.equal(await new DatabaseService(client).isReady(), false);
});

test("database health controller returns ready and unavailable HTTP statuses", async () => {
  async function invoke(ready: boolean) {
    let statusCode = 0;
    let responseBody: unknown;
    const database = { isReady: async () => ready } as unknown as DatabaseService;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(body: unknown) { responseBody = body; return this; },
    } as unknown as Response;

    await new DatabaseHealthController(database).check({} as Request, response, () => undefined);
    return { statusCode, responseBody };
  }

  assert.deepEqual(await invoke(true), {
    statusCode: 200,
    responseBody: { success: true, status: "ready", database: "connected" },
  });
  assert.deepEqual(await invoke(false), {
    statusCode: 503,
    responseBody: { success: false, status: "unavailable", database: "disconnected" },
  });
});

test("repositories use scoped queries and stable ordering for domain lookups", async () => {
  const calls: Call[] = [];
  const client = createRepositoryClient(calls);

  await new UserRepository(client).findById("user-1");
  await new UserRepository(client).findByEmail("member@example.test");
  await new ProjectRepository(client).findById("project-1");
  await new ProjectRepository(client).findForMember("project-1", "user-1");
  await new ProjectRepository(client).listForMember("user-1");
  await new TaskRepository(client).findById("task-1");
  await new TaskRepository(client).listForProject("project-1");
  await new TaskRepository(client).listAssignedTo("user-1");
  await new CommentRepository(client).listForTask("task-1");
  await new AttachmentRepository(client).listForTask("task-1");

  assert.deepEqual(calls, [
    { model: "user", method: "findUnique", args: { where: { id: "user-1" } } },
    { model: "user", method: "findUnique", args: { where: { email: "member@example.test" } } },
    { model: "project", method: "findUnique", args: { where: { id: "project-1" } } },
    {
      model: "project",
      method: "findFirst",
      args: { where: { id: "project-1", archivedAt: null, members: { some: { userId: "user-1" } } } },
    },
    {
      model: "project",
      method: "findMany",
      args: { where: { archivedAt: null, members: { some: { userId: "user-1" } } }, orderBy: { createdAt: "desc" } },
    },
    { model: "task", method: "findUnique", args: { where: { id: "task-1" } } },
    {
      model: "task",
      method: "findMany",
      args: { where: { projectId: "project-1" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    },
    {
      model: "task",
      method: "findMany",
      args: { where: { assigneeId: "user-1" }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] },
    },
    {
      model: "comment",
      method: "findMany",
      args: { where: { taskId: "task-1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
    {
      model: "attachment",
      method: "findMany",
      args: { where: { taskId: "task-1" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    },
  ]);
});
