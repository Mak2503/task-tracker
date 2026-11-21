import type { RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors/app-error.js";
import { TaskService } from "../tasks/task.service.js";
import { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";
import { SseEventHub } from "../notifications/sse-event-hub.js";
import { createTaskSchema, projectIdParamSchema, taskIdParamSchema, taskQuerySchema, updateTaskSchema } from "../tasks/task.validation.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw new AppError("Request data is invalid", 400, "VALIDATION_ERROR");
    throw error;
  }
}

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
  return request.auth.userId;
}

export class TaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly memberships?: ProjectMembershipRepository,
    private readonly events?: SseEventHub,
  ) {}

  create: RequestHandler = async (req, res) => {
    const projectId = parse<string>(projectIdParamSchema, req.params.projectId);
    const input = parse(createTaskSchema, req.body);
    const task = await this.tasks.create(projectId, authenticatedUserId(req), input);
    if (task.assigneeId && this.memberships && this.events) {
      this.events.publish([task.assigneeId], {
        type: "task.assigned", projectId, taskId: task.id, actorId: authenticatedUserId(req),
        task: { title: task.title, status: task.status, assigneeId: task.assigneeId },
      });
    }
    res.status(201).json({ success: true, data: { task } });
  };

  listForProject: RequestHandler = async (req, res) => {
    const projectId = parse<string>(projectIdParamSchema, req.params.projectId);
    const query = parse(taskQuerySchema, req.query);
    const result = await this.tasks.listForProject(projectId, authenticatedUserId(req), query);
    res.status(200).json({ success: true, data: result });
  };

  listAssignedToMe: RequestHandler = async (req, res) => {
    const query = parse(taskQuerySchema, req.query);
    const result = await this.tasks.listAssignedTo(authenticatedUserId(req), query);
    res.status(200).json({ success: true, data: result });
  };

  get: RequestHandler = async (req, res) => {
    const projectId = parse<string>(projectIdParamSchema, req.params.projectId);
    const taskId = parse<string>(taskIdParamSchema, req.params.taskId);
    const task = await this.tasks.get(projectId, taskId, authenticatedUserId(req));
    res.status(200).json({ success: true, data: { task } });
  };

  update: RequestHandler = async (req, res) => {
    const projectId = parse<string>(projectIdParamSchema, req.params.projectId);
    const taskId = parse<string>(taskIdParamSchema, req.params.taskId);
    const input = parse(updateTaskSchema, req.body);
    const previous = await this.tasks.get(projectId, taskId, authenticatedUserId(req));
    const task = await this.tasks.update(projectId, taskId, authenticatedUserId(req), input);
    if (this.memberships && this.events) {
      const members = await this.memberships.listForProject(projectId);
      const recipients = members.map((member) => member.userId);
      const eventData = {
        projectId,
        taskId: task.id,
        actorId: authenticatedUserId(req),
        task: { title: task.title, status: task.status, assigneeId: task.assigneeId },
      };
      this.events.publish(recipients, { type: "task.updated", ...eventData });
      if (task.assigneeId && task.assigneeId !== previous.assigneeId) {
        this.events.publish([task.assigneeId], { type: "task.assigned", ...eventData });
      }
    }
    res.status(200).json({ success: true, data: { task } });
  };

  archive: RequestHandler = async (req, res) => {
    const projectId = parse<string>(projectIdParamSchema, req.params.projectId);
    const taskId = parse<string>(taskIdParamSchema, req.params.taskId);
    await this.tasks.archive(projectId, taskId, authenticatedUserId(req));
    res.status(204).end();
  };
}
