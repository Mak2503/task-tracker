# TaskMaster API

A TypeScript and Express backend for collaborative task tracking. The implementation is being delivered in milestones; see [milestone.md](./milestone.md) for scope and progress.

The complete HTTP contract is in [OpenAPI 3.1](./docs/openapi.json), with a [full API reference and per-endpoint request/response examples](./docs/api-reference.md) and [workflow examples](./docs/examples.md). Deployment, backup, readiness, and smoke-test instructions are in [operations.md](./docs/operations.md).

## Requirements

- Node.js 20 or later
- npm

## Run locally

```sh
npm install
cp .env.example .env
# Generate a secret and set JWT_SECRET in .env before starting the API.
openssl rand -base64 32
docker compose up -d
npm run db:deploy
npm run dev
```

The API listens on `http://localhost:3000` by default. PostgreSQL must be running before the API starts. `GET /api/health` checks the service process and `GET /api/health/ready` checks database readiness.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (integer from 1 to 65535) |
| `NODE_ENV` | `development` | Runtime mode: `development`, `test`, or `production` |
| `DATABASE_URL` | `postgresql://postgres:<your_password>@localhost:5432/postgres?schema=public` | PostgreSQL connection URL; adjust username/password for your local PostgreSQL setup |
| `JWT_SECRET` | required | At least 32 bytes; generate with `openssl rand -base64 32` and keep private |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime in seconds (60 to 3600) |
| `OBJECT_STORAGE_ENDPOINT` | `http://localhost:9000` | S3-compatible endpoint; MinIO locally, AWS S3 endpoint in production |
| `OBJECT_STORAGE_BUCKET` | `taskmaster` | Private bucket name; created by the local Compose setup |
| `OBJECT_STORAGE_REGION` | `us-east-1` | S3 region |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | local MinIO credentials | Credentials for the S3-compatible service |
| `OBJECT_STORAGE_FORCE_PATH_STYLE` | `true` | Use path-style S3 requests for local MinIO; set `false` for AWS S3 |

The local database target is PostgreSQL on port `5432`, database `postgres`. The example URL uses a placeholder password; replace it with your local PostgreSQL password. Generate and set `JWT_SECRET` before starting the API. Prisma migrations are stored under `prisma/migrations`; use `npm run db:migrate -- --name <migration-name>` during development and `npm run db:deploy` to apply committed migrations in deployment environments. `docker compose up -d` starts MinIO and creates the private local bucket `taskmaster`. Compose uses Chainguard's public MinIO and `mc` client images because the former upstream MinIO registry images are no longer pullable without registry access; the S3 API and presigned POST flow remain the same.

## Data model

The schema defines users, projects, project memberships, project invitations, tasks, comments, and attachment metadata. File bytes are not stored in PostgreSQL; attachments hold a private object storage key.

## Projects and membership

- `POST /api/projects`, `GET /api/projects`, and `GET /api/projects/:projectId` create and list active projects or read a member's project.
- `PATCH /api/projects/:projectId` updates project details; `DELETE /api/projects/:projectId` archives it.
- `GET /api/projects/:projectId/members` lists members. The owner can change member roles; owners and admins can remove members, with admins limited to regular members.
- `POST /api/projects/:projectId/invitations` creates an email-bound invitation. It returns a single-use token for the caller to deliver to the invitee; only a SHA-256 hash is stored. The token expires after seven days.
- An authenticated invitee accepts with `POST /api/invitations/:token/accept`. The account email must match the invitation email.

Owners and admins can create, list, and revoke invitations. Project data and membership operations are scoped to project members.

## Tasks

- `POST /api/projects/:projectId/tasks` creates a task; optional assignees must be members of that project.
- `GET /api/projects/:projectId/tasks` lists project tasks. Supported query parameters: `status`, `assigneeId` (UUID or `unassigned`), `search`, `dueAfter`, `dueBefore`, `sortBy`, `sortOrder`, `page`, and `pageSize`.
- `GET /api/tasks/assigned-to-me` lists the signed-in user's tasks across active projects where they remain a member.
- `GET`, `PATCH`, and `DELETE /api/projects/:projectId/tasks/:taskId` read, update, and archive a task. `PATCH` supports title, description, assignee, due date, and status (`OPEN`, `IN_PROGRESS`, `COMPLETED`).

Sorting is allowlisted and uses task ID as a tie-breaker. Page size is limited to 100. Task deletion is a soft archive.

## Comments and attachments

- `POST` and `GET /api/projects/:projectId/tasks/:taskId/comments` create and list task comments.
- `PATCH` and `DELETE /api/projects/:projectId/tasks/:taskId/comments/:commentId` edit an author's comment or moderate it as a project owner/admin.
- `POST /api/projects/:projectId/tasks/:taskId/attachments` reserves attachment metadata and returns a five-minute presigned `POST` policy with form fields. The policy restricts the upload to the declared content type and exact declared file size.
- Submit the returned fields and the file as `multipart/form-data` directly to the storage URL, then call `POST /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete`. The API verifies stored size and content type before making the attachment available.
- `GET` on the attachments collection lists available files. `GET /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download` returns a short-lived download URL; `DELETE` removes the object and metadata.

Attachments are limited to 25 MiB and the allowlist in `src/attachments/attachment.service.ts`. Metadata lives in PostgreSQL; bytes live in MinIO locally or private S3 in production. Configure the S3 bucket CORS policy for the frontend origin and `POST`/`GET` methods when browsers upload directly. Never make the bucket public.

## Real-time notifications

- Connect to `GET /api/notifications/events` with the normal bearer access token. Since the API uses bearer headers, clients can consume the authenticated SSE response with `fetch` streaming and send `Authorization: Bearer <token>`; the endpoint follows the SSE wire format.
- `task.assigned` is sent to the newly assigned project member. `task.updated` is sent to current project members. Event payloads include the task id, project id, actor, status, title, and assignee.
- The stream sends a heartbeat comment every 25 seconds. Clients can reconnect with the `Last-Event-ID` header; the process keeps a bounded in-memory replay window and replays only events originally addressed to that user. A cursor outside the window starts a fresh stream.
- Notifications are process-local and best-effort: reconnect replay works on the same running API process. Use a shared durable event broker before running multiple API replicas.

## Authentication

- `POST /api/auth/register` creates an account.
- `POST /api/auth/login` returns a short-lived bearer access token.
- `POST /api/auth/logout` revokes the current token session.
- `GET /api/users/me` and `PATCH /api/users/me` read and update the authenticated user's profile.

Passwords are hashed with bcrypt. Access tokens are signed with HS256 and checked against persisted session records on each authenticated request, so logout revocation takes effect immediately.

## Tests

```sh
npm test
```

The suite validates the Prisma schema, builds the TypeScript project, then runs unit, API-contract, persistence, authentication, project, task, collaboration, and notification tests. The end-to-end database workflow is opt-in; see [operations.md](./docs/operations.md#end-to-end-smoke-test).

## Error response

All unmatched routes and handled application errors use this shape:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /api/example was not found"
  }
}
```
