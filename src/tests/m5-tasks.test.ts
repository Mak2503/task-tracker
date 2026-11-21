import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { TaskService } from "../tasks/task.service.js";
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from "../tasks/task.validation.js";
import { TaskRepository, type TaskQuery } from "../repositories/task.repository.js";
import type { ProjectRepository } from "../repositories/project.repository.js";
import type { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";

const sampleTask = {
  id: "task-1",
  projectId: "project-1",
  title: "Plan release",
  description: null,
  status: "OPEN" as const,
  dueDate: null,
  assigneeId: null,
  creatorId: "owner-1",
  archivedAt: null,
};

function createTaskHarness() {
  const members = new Map<string, "OWNER" | "ADMIN" | "MEMBER">([
    ["owner-1", "OWNER"],
    ["member-1", "MEMBER"],
    ["assignee-1", "MEMBER"],
    ["admin-1", "ADMIN"],
  ]);
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let task = sampleTask;
  const tasks = {
    create: async (...args: unknown[]) => {
      calls.push({ method: "create", args });
      return { ...sampleTask, ...(args[0] as object) };
    },
    findActiveInProject: async (taskId: string, projectId: string) =>
      task.id === taskId && task.projectId === projectId ? task : null,
    update: async (taskId: string, input: Record<string, unknown>) => {
      calls.push({ method: "update", args: [taskId, input] });
      task = { ...task, ...input } as typeof sampleTask;
      return task;
    },
    archive: async (taskId: string) => {
      calls.push({ method: "archive", args: [taskId] });
    },
    listForProject: async (_projectId: string, query: TaskQuery) => ({
      tasks: [task],
      total: query.pageSize + 1,
    }),
    listAssignedTo: async () => ({ tasks: [task], total: 1 }),
  };
  const projects = {
    findForMember: async (projectId: string, userId: string) =>
      projectId === "project-1" && members.has(userId)
        ? { id: projectId, ownerId: "owner-1", archivedAt: null }
        : null,
  } as unknown as ProjectRepository;
  const memberships = {
    findRole: async (_projectId: string, userId: string) => {
      const role = members.get(userId);
      return role ? { role } : null;
    },
  } as unknown as ProjectMembershipRepository;
  return { service: new TaskService(tasks as unknown as TaskRepository, projects, memberships), calls, members };
}

function defaultQuery(): TaskQuery {
  return { sortBy: "createdAt", sortOrder: "desc", page: 1, pageSize: 20 };
}

test("task creation is project-scoped and permits assignment only to project members", async () => {
  const harness = createTaskHarness();
  const created = await harness.service.create("project-1", "owner-1", {
    title: " New task ",
    assigneeId: "assignee-1",
  });
  assert.equal(created.projectId, "project-1");
  assert.equal(created.creatorId, "owner-1");
  assert.equal(created.assigneeId, "assignee-1");

  await assert.rejects(harness.service.create("project-1", "owner-1", {
    title: "Invalid assignment",
    assigneeId: "outsider-1",
  }), (error: unknown) => error instanceof AppError && error.statusCode === 404);
  await assert.rejects(harness.service.create("other-project", "owner-1", { title: "Out of scope" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("project members can read and update task status and fields", async () => {
  const harness = createTaskHarness();
  const result = await harness.service.update("project-1", "task-1", "member-1", {
    status: "COMPLETED",
    title: "Release plan",
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.title, "Release plan");
  assert.equal((await harness.service.get("project-1", "task-1", "member-1")).id, "task-1");
});

test("task reads hide tasks outside the requested project and from non-members", async () => {
  const harness = createTaskHarness();
  await assert.rejects(harness.service.get("other-project", "task-1", "owner-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
  await assert.rejects(harness.service.get("project-1", "task-1", "outsider-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("task archive is restricted to its creator or project managers", async () => {
  const harness = createTaskHarness();
  await harness.service.archive("project-1", "task-1", "owner-1");
  assert.ok(harness.calls.some((call) => call.method === "archive"));

  const nonCreatorTask = createTaskHarness();
  await assert.rejects(nonCreatorTask.service.archive("project-1", "task-1", "member-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
  await nonCreatorTask.service.archive("project-1", "task-1", "admin-1");
});

test("task lists return stable page metadata", async () => {
  const harness = createTaskHarness();
  const result = await harness.service.listForProject("project-1", "member-1", {
    ...defaultQuery(), page: 2, pageSize: 10,
  });
  assert.deepEqual(result.pagination, { page: 2, pageSize: 10, total: 11, totalPages: 2 });
  assert.equal(result.tasks.length, 1);
});

test("task repository combines filters, case-insensitive search, allowlisted sort, and pagination", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const prisma = {
    task: {
      findMany: async (args: unknown) => { calls.push({ method: "findMany", args }); return []; },
      count: async (args: unknown) => { calls.push({ method: "count", args }); return 3; },
    },
  } as unknown as PrismaClient;
  const repository = new TaskRepository(prisma);
  const query: TaskQuery = {
    status: "IN_PROGRESS",
    assigneeId: "unassigned",
    search: "  launch  ".trim(),
    dueAfter: new Date("2026-01-01T00:00:00.000Z"),
    dueBefore: new Date("2026-12-31T00:00:00.000Z"),
    sortBy: "title",
    sortOrder: "asc",
    page: 3,
    pageSize: 10,
  };

  await repository.listForProject("project-1", query);

  const expectedWhere = {
    projectId: "project-1",
    archivedAt: null,
    status: "IN_PROGRESS",
    assigneeId: null,
    dueDate: { gte: query.dueAfter, lte: query.dueBefore },
    OR: [
      { title: { contains: "launch", mode: "insensitive" } },
      { description: { contains: "launch", mode: "insensitive" } },
    ],
  };
  assert.deepEqual(calls, [
    {
      method: "findMany",
      args: { where: expectedWhere, orderBy: [{ title: "asc" }, { id: "asc" }], skip: 20, take: 10 },
    },
    { method: "count", args: { where: expectedWhere } },
  ]);
});

test("assigned-task query cannot expose tasks from projects the user has left", async () => {
  const calls: unknown[] = [];
  const prisma = {
    task: {
      findMany: async (args: unknown) => { calls.push(args); return []; },
      count: async (args: unknown) => { calls.push(args); return 0; },
    },
  } as unknown as PrismaClient;

  await new TaskRepository(prisma).listAssignedTo("user-1", defaultQuery());

  assert.deepEqual(calls[0], {
    where: {
      assigneeId: "user-1",
      project: { archivedAt: null, members: { some: { userId: "user-1" } } },
      archivedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 0,
    take: 20,
  });
});

test("task validation rejects invalid filters, unstable sort inputs, and invalid date ranges", () => {
  assert.equal(taskQuerySchema.safeParse({ sortBy: "creatorId" }).success, false);
  assert.equal(taskQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(taskQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(taskQuerySchema.safeParse({
    dueAfter: "2026-12-01T00:00:00.000Z",
    dueBefore: "2026-11-01T00:00:00.000Z",
  }).success, false);
  assert.equal(createTaskSchema.safeParse({ title: "  " }).success, false);
  assert.equal(updateTaskSchema.safeParse({}).success, false);
  assert.equal(updateTaskSchema.safeParse({ status: "COMPLETED" }).success, true);
});
