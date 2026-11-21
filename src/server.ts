import app from "./app.js";
import { env } from "./config/env.js";
import { DatabaseService } from "./database/database.service.js";
import { prismaClient } from "./database/prisma-client.js";

const database = new DatabaseService(prismaClient);

async function startServer(): Promise<void> {
  await database.connect();
  const server = app.listen(env.PORT, () => {
    console.log(`Server running at http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received; shutting down`);
    server.close(() => {
      void database.disconnect().finally(() => process.exit(0));
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch(async (error: unknown) => {
  console.error("Unable to start TaskMaster API", error);
  await database.disconnect();
  process.exitCode = 1;
});
