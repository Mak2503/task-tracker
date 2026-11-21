import type { PrismaClient } from "../generated/prisma/client.js";

export class UserRepository {
  constructor(private readonly client: PrismaClient) {}

  findById(id: string) {
    return this.client.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.client.user.findUnique({ where: { email } });
  }

  create(input: { email: string; passwordHash: string; displayName: string }) {
    return this.client.user.create({ data: input });
  }

  findProfileById(id: string) {
    return this.client.user.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true, createdAt: true, updatedAt: true },
    });
  }

  updateProfile(id: string, input: { displayName: string }) {
    return this.client.user.update({
      where: { id },
      data: input,
      select: { id: true, email: true, displayName: true, createdAt: true, updatedAt: true },
    });
  }
}
