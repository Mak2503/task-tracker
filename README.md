# TaskMaster API

A TypeScript and Express backend for collaborative task tracking. The implementation is being delivered in milestones; see [milestone.md](./milestone.md) for scope and progress.

## Requirements

- Node.js 20 or later
- npm

## Run locally

```sh
npm install
cp .env.example .env
# Generate a secret and set JWT_SECRET in .env before starting the API.
openssl rand -base64 32
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

The local database target is PostgreSQL on port `5432`, database `postgres`. The example URL uses a placeholder password; replace it with your local PostgreSQL password. Generate and set `JWT_SECRET` before starting the API. Prisma migrations are stored under `prisma/migrations`; use `npm run db:migrate -- --name <migration-name>` during development and `npm run db:deploy` to apply committed migrations in deployment environments.

## Data model

The initial schema defines users, projects, project memberships, tasks, comments, and attachment metadata. File bytes are not stored in PostgreSQL; attachments hold a storage key for a storage provider added in the collaboration milestone.

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

The suite validates the Prisma schema, builds the TypeScript project, then runs the foundation, persistence, authentication, and profile tests. Future milestones add tests for each feature before that milestone is considered complete.

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
