import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

export type InvitationAcceptance =
  | { status: "NOT_FOUND" | "EMAIL_MISMATCH" | "EXPIRED" | "USED" | "ARCHIVED" | "ALREADY_MEMBER" }
  | { status: "ACCEPTED"; projectId: string };

export class ProjectInvitationRepository {
  constructor(private readonly client: PrismaClient) {}

  findPending(projectId: string, email: string, now = new Date()) {
    return this.client.projectInvitation.findFirst({
      where: {
        projectId,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
  }

  create(input: {
    projectId: string;
    email: string;
    invitedById: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.client.projectInvitation.create({ data: input });
  }

  listPending(projectId: string, now = new Date()) {
    return this.client.projectInvitation.findMany({
      where: { projectId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, email: true, createdAt: true, expiresAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }

  async revoke(projectId: string, invitationId: string, revokedAt = new Date()): Promise<boolean> {
    const result = await this.client.projectInvitation.updateMany({
      where: {
        id: invitationId,
        projectId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: revokedAt },
      },
      data: { revokedAt },
    });
    return result.count > 0;
  }

  accept(tokenHash: string, userId: string, email: string, now = new Date()): Promise<InvitationAcceptance> {
    return this.client.$transaction(async (transaction: Prisma.TransactionClient): Promise<InvitationAcceptance> => {
      const invitation = await transaction.projectInvitation.findUnique({
        where: { tokenHash },
        include: { project: { select: { archivedAt: true } } },
      });
      if (!invitation) return { status: "NOT_FOUND" };
      if (invitation.email !== email) return { status: "EMAIL_MISMATCH" };
      if (invitation.acceptedAt || invitation.revokedAt) return { status: "USED" };
      if (invitation.expiresAt <= now) return { status: "EXPIRED" };
      if (invitation.project.archivedAt) return { status: "ARCHIVED" };

      const existingMember = await transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        select: { userId: true },
      });
      if (existingMember) return { status: "ALREADY_MEMBER" };

      await transaction.projectMember.create({
        data: { projectId: invitation.projectId, userId, role: "MEMBER" },
      });
      const updated = await transaction.projectInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (updated.count !== 1) {
        throw new Error("Invitation was accepted concurrently");
      }
      return { status: "ACCEPTED", projectId: invitation.projectId };
    });
  }
}
