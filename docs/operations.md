# Operations

## Deployment

1. Use a supported Node.js 20+ runtime and install the locked dependencies with `npm ci`.
2. Set `NODE_ENV=production`, `PORT`, `DATABASE_URL`, and a randomly generated `JWT_SECRET` of at least 32 bytes. Configure private S3 credentials and endpoint values through the runtime's secret manager; do not copy local MinIO credentials into production.
3. Apply schema changes with `npm run db:deploy` as a release step, then start the API with `npm start`.
4. Keep the object storage bucket private. Configure its CORS policy for the deployed frontend origin, `POST` and `GET`, and only required headers. Lifecycle rules can remove abandoned multipart/pending upload objects.
5. Put the API behind TLS termination and a reverse proxy configured to disable response buffering for `/api/notifications/events` so SSE heartbeats and events stream immediately.

The service validates configuration and connects to PostgreSQL before listening. It handles `SIGINT` and `SIGTERM` by closing the HTTP listener and disconnecting Prisma. Liveness is `GET /api/health`; use `GET /api/health/ready` for readiness checks.

## Database backup and restore

Back up PostgreSQL with the platform's managed backup service or `pg_dump` and test restores regularly. Object bytes are stored separately from metadata, so back up/version the S3 bucket as well; restoring only PostgreSQL leaves attachment references without their objects. Keep database and bucket retention aligned. Do not run `prisma migrate dev` in production; use the committed migration set through `npm run db:deploy`.

## Logs and notifications

The current process writes startup, shutdown, and fatal startup messages to stdout/stderr. Route those streams to the deployment platform's centralized log service, restrict access, and avoid logging credentials, bearer tokens, presigned URLs, or uploaded content. Notifications use per-process memory and are best-effort. For multiple API replicas or durable delivery, add a shared broker and persistent event cursor before scaling horizontally.

## End-to-end smoke test

The opt-in smoke test registers temporary users, creates a project, accepts an invitation, creates and assigns a task, posts a comment, completes the task, and verifies logout revocation. It cleans up the records it creates. Use only a disposable local PostgreSQL database named `postgres` with migrations applied:

```sh
npm run db:deploy
TASKMASTER_E2E=1 npm run test:e2e
```

Without `TASKMASTER_E2E=1`, the e2e test is skipped by the regular `npm test` suite. Do not enable it against production or a shared database.
