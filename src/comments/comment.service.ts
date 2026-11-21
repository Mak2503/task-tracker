import { AppError } from "../errors/app-error.js";
import { CommentRepository } from "../repositories/comment.repository.js";
import { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";
import { TaskService } from "../tasks/task.service.js";

export class CommentService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly tasks: TaskService,
    private readonly memberships: ProjectMembershipRepository,
  ) {}

  async create(projectId: string, taskId: string, authorId: string, body: string) {
    await this.tasks.get(projectId, taskId, authorId);
    return this.comments.create({ body, taskId, authorId });
  }

  async list(projectId: string, taskId: string, userId: string) {
    await this.tasks.get(projectId, taskId, userId);
    return this.comments.listForTask(taskId);
  }

  async update(projectId: string, taskId: string, commentId: string, userId: string, body: string) {
    await this.tasks.get(projectId, taskId, userId);
    const comment = await this.comments.findByIdInTask(commentId, taskId);
    if (!comment) throw this.commentNotFound();
    if (comment.authorId !== userId) {
      throw new AppError("Only the comment author can edit this comment", 403, "FORBIDDEN");
    }
    return this.comments.update(commentId, body);
  }

  async delete(projectId: string, taskId: string, commentId: string, userId: string): Promise<void> {
    const task = await this.tasks.get(projectId, taskId, userId);
    const comment = await this.comments.findByIdInTask(commentId, taskId);
    if (!comment) throw this.commentNotFound();
    if (comment.authorId !== userId) {
      const membership = await this.memberships.findRole(projectId, userId);
      if (membership?.role !== "OWNER" && membership?.role !== "ADMIN") {
        throw new AppError("Only the comment author or a project manager can delete this comment", 403, "FORBIDDEN");
      }
    }
    await this.comments.delete(comment.id);
  }

  private commentNotFound(): AppError {
    return new AppError("Comment was not found", 404, "COMMENT_NOT_FOUND");
  }
}
