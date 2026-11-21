import type { PrismaClient } from "../generated/prisma/client.js";

export class AttachmentRepository {
  constructor(private readonly client: PrismaClient) {}

  listForTask(taskId: string) {
    return this.client.attachment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }
}
