import type { PrismaClient } from "../generated/prisma/client.js";

export class AttachmentRepository {
  constructor(private readonly client: PrismaClient) {}

  createPending(input: {
    fileName: string;
    contentType: string;
    sizeBytes: bigint;
    storageKey: string;
    taskId: string;
    uploadedById: string;
    uploadExpiresAt: Date;
  }) {
    return this.client.attachment.create({ data: input });
  }

  listAvailableForTask(taskId: string) {
    return this.client.attachment.findMany({
      where: { taskId, status: "AVAILABLE" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }

  findByIdInTask(id: string, taskId: string) {
    return this.client.attachment.findFirst({ where: { id, taskId } });
  }

  markAvailable(id: string) {
    return this.client.attachment.update({ where: { id }, data: { status: "AVAILABLE" } });
  }

  markFailed(id: string) {
    return this.client.attachment.update({ where: { id }, data: { status: "FAILED" } });
  }

  delete(id: string) {
    return this.client.attachment.delete({ where: { id } });
  }
}
