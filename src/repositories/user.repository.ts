import type { PrismaClient } from "../generated/prisma/client.js";

export class UserRepository {
  constructor(private readonly client: PrismaClient) {}

  findById(id: string) {
    return this.client.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.client.user.findUnique({ where: { email } });
  }
}
