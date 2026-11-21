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

const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret && Buffer.byteLength(jwtSecret, "utf8") < 32) {
  throw new Error("JWT_SECRET must be at least 32 bytes");
}

const jwtAccessTokenTtlSeconds = Number(process.env.JWT_ACCESS_TOKEN_TTL_SECONDS ?? 900);
if (!Number.isInteger(jwtAccessTokenTtlSeconds) || jwtAccessTokenTtlSeconds < 60 || jwtAccessTokenTtlSeconds > 3600) {
  throw new Error("JWT_ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and 3600");
}

const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
try {
  const parsedStorageEndpoint = new URL(objectStorageEndpoint);
  if (!["http:", "https:"].includes(parsedStorageEndpoint.protocol)) throw new Error();
} catch {
  throw new Error("OBJECT_STORAGE_ENDPOINT must be a valid HTTP or HTTPS URL");
}

const objectStorageBucket = process.env.OBJECT_STORAGE_BUCKET ?? "taskmaster";
if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(objectStorageBucket)) {
  throw new Error("OBJECT_STORAGE_BUCKET must be a valid S3 bucket name");
}

const forcePathStyleInput = process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? "true";
if (!["true", "false"].includes(forcePathStyleInput.toLowerCase())) {
  throw new Error("OBJECT_STORAGE_FORCE_PATH_STYLE must be true or false");
}

export const env = {
  PORT: port,
  NODE_ENV: nodeEnv,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
  JWT_ACCESS_TOKEN_TTL_SECONDS: jwtAccessTokenTtlSeconds,
  OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint,
  OBJECT_STORAGE_BUCKET: objectStorageBucket,
  OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
  OBJECT_STORAGE_ACCESS_KEY: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "taskmaster-local",
  OBJECT_STORAGE_SECRET_KEY: process.env.OBJECT_STORAGE_SECRET_KEY ?? "taskmaster-local-secret",
  OBJECT_STORAGE_FORCE_PATH_STYLE: forcePathStyleInput.toLowerCase() === "true",
};
