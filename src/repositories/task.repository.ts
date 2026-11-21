import type { PrismaClient } from "../generated/prisma/client.js";

export class TaskRepository {
  constructor(private readonly client: PrismaClient) {}

  findById(id: string) {
    return this.client.task.findUnique({ where: { id } });
  }

  listForProject(projectId: string) {
    return this.client.task.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }

  listAssignedTo(userId: string) {
    return this.client.task.findMany({
      where: { assigneeId: userId },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
  }
}
