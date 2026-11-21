import type { PrismaClient } from "../generated/prisma/client.js";

export class CommentRepository {
  constructor(private readonly client: PrismaClient) {}

  create(input: { body: string; taskId: string; authorId: string }) {
    return this.client.comment.create({
      data: input,
      include: { author: { select: { id: true, displayName: true } } },
    });
  }

  listForTask(taskId: string) {
    return this.client.comment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  findByIdInTask(id: string, taskId: string) {
    return this.client.comment.findFirst({ where: { id, taskId } });
  }

  update(id: string, body: string) {
    return this.client.comment.update({
      where: { id },
      data: { body },
      include: { author: { select: { id: true, displayName: true } } },
    });
  }

  delete(id: string) {
    return this.client.comment.delete({ where: { id } });
  }
}
