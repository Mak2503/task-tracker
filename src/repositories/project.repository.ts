import type { PrismaClient } from "../generated/prisma/client.js";

export class ProjectRepository {
  constructor(private readonly client: PrismaClient) {}

  findById(id: string) {
    return this.client.project.findUnique({ where: { id } });
  }

  findForMember(projectId: string, userId: string) {
    return this.client.project.findFirst({
      where: { id: projectId, members: { some: { userId } } },
    });
  }

  listForMember(userId: string) {
    return this.client.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
