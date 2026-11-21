import type { PrismaClient } from "../generated/prisma/client.js";

export class DatabaseService {
  constructor(private readonly client: PrismaClient) {}

  async connect(): Promise<void> {
    await this.client.$connect();
  }

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  async isReady(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
