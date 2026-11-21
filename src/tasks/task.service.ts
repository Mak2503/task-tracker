import { AppError } from "../errors/app-error.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";
import { TaskRepository, type TaskQuery } from "../repositories/task.repository.js";

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  assigneeId?: string | null;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  assigneeId?: string | null;
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED";
};

export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
    private readonly memberships: ProjectMembershipRepository,
  ) {}

  async create(projectId: string, creatorId: string, input: CreateTaskInput) {
    await this.requireProjectMember(projectId, creatorId);
    if (input.assigneeId) await this.requireProjectMember(projectId, input.assigneeId);
    return this.tasks.create({ ...input, projectId, creatorId });
  }

  async listForProject(projectId: string, userId: string, query: TaskQuery) {
    await this.requireProjectMember(projectId, userId);
    const result = await this.tasks.listForProject(projectId, query);
    return this.withPagination(result, query);
  }

  async listAssignedTo(userId: string, query: TaskQuery) {
    const result = await this.tasks.listAssignedTo(userId, query);
    return this.withPagination(result, query);
  }

  async get(projectId: string, taskId: string, userId: string) {
    await this.requireProjectMember(projectId, userId);
    const task = await this.tasks.findActiveInProject(taskId, projectId);
    if (!task) throw this.taskNotFound();
    return task;
  }

  async update(projectId: string, taskId: string, userId: string, input: UpdateTaskInput) {
    await this.requireProjectMember(projectId, userId);
    const task = await this.tasks.findActiveInProject(taskId, projectId);
    if (!task) throw this.taskNotFound();
    if (input.assigneeId) await this.requireProjectMember(projectId, input.assigneeId);
    return this.tasks.update(taskId, input);
  }

  async archive(projectId: string, taskId: string, userId: string): Promise<void> {
    const membership = await this.requireProjectMember(projectId, userId);
    const task = await this.tasks.findActiveInProject(taskId, projectId);
    if (!task) throw this.taskNotFound();
    if (task.creatorId !== userId && membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new AppError("Only the task creator or a project manager can archive this task", 403, "FORBIDDEN");
    }
    await this.tasks.archive(taskId);
  }

  private async requireProjectMember(projectId: string, userId: string) {
    const project = await this.projects.findForMember(projectId, userId);
    if (!project) throw new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
    const membership = await this.memberships.findRole(projectId, userId);
    if (!membership) throw new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
    return membership;
  }

  private withPagination<T>(result: { tasks: T[]; total: number }, query: TaskQuery) {
    return {
      tasks: result.tasks,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  private taskNotFound(): AppError {
    return new AppError("Task was not found", 404, "TASK_NOT_FOUND");
  }
}
