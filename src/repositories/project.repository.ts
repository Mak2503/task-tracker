import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

export class ProjectRepository {
  constructor(private readonly client: PrismaClient) {}

  findById(id: string) {
    return this.client.project.findUnique({ where: { id } });
  }

  createWithOwner(input: { name: string; description?: string; ownerId: string }) {
    return this.client.$transaction(async (transaction: Prisma.TransactionClient) => {
      const project = await transaction.project.create({
        data: { name: input.name, description: input.description, ownerId: input.ownerId },
      });
      await transaction.projectMember.create({
        data: { projectId: project.id, userId: input.ownerId, role: "OWNER" },
      });
      return project;
    });
  }

  findForMember(projectId: string, userId: string) {
    return this.client.project.findFirst({
      where: { id: projectId, archivedAt: null, members: { some: { userId } } },
    });
  }

  listForMember(userId: string) {
    return this.client.project.findMany({
      where: { archivedAt: null, members: { some: { userId } } },
      orderBy: { createdAt: "desc" },
    });
  }

  update(id: string, input: { name?: string; description?: string | null }) {
    return this.client.project.update({ where: { id }, data: input });
  }

  archive(id: string, archivedAt = new Date()) {
    return this.client.project.update({ where: { id }, data: { archivedAt } });
  }
}
