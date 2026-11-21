import "dotenv/config";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const nodeEnv = process.env.NODE_ENV ?? "development";
if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error("NODE_ENV must be development, test, or production");
}

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres?schema=public";
try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error();
  }
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
}

export const env = {
  PORT: port,
  NODE_ENV: nodeEnv,
  DATABASE_URL: databaseUrl,
};
