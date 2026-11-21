import type { PrismaClient } from "../generated/prisma/client.js";

export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export class ProjectMembershipRepository {
  constructor(private readonly client: PrismaClient) {}

  findRole(projectId: string, userId: string) {
    return this.client.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
  }

  findMember(projectId: string, userId: string) {
    return this.client.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { projectId: true, userId: true, role: true, joinedAt: true },
    });
  }

  listForProject(projectId: string) {
    return this.client.projectMember.findMany({
      where: { projectId },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { email: true, displayName: true } },
      },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    });
  }

  updateRole(projectId: string, userId: string, role: Exclude<MembershipRole, "OWNER">) {
    return this.client.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
      select: { projectId: true, userId: true, role: true, joinedAt: true },
    });
  }

  remove(projectId: string, userId: string) {
    return this.client.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
  }
}
