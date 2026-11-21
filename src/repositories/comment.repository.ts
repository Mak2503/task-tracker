import type { PrismaClient } from "../generated/prisma/client.js";

export class CommentRepository {
  constructor(private readonly client: PrismaClient) {}

  listForTask(taskId: string) {
    return this.client.comment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }
}
