import type { PrismaClient } from "../generated/prisma/client.js";

export class AuthSessionRepository {
  constructor(private readonly client: PrismaClient) {}

  create(input: { tokenId: string; userId: string; expiresAt: Date }) {
    return this.client.authSession.create({ data: input });
  }

  findActive(tokenId: string, userId: string, now = new Date()) {
    return this.client.authSession.findFirst({
      where: { tokenId, userId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, tokenId: true, userId: true, expiresAt: true },
    });
  }

  async revoke(tokenId: string, userId: string, revokedAt = new Date()): Promise<boolean> {
    const result = await this.client.authSession.updateMany({
      where: { tokenId, userId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count > 0;
  }
}
