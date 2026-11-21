# TaskMaster API

A TypeScript and Express backend for collaborative task tracking. The implementation is being delivered in milestones; see [milestone.md](./milestone.md) for scope and progress.

## Requirements

- Node.js 20 or later
- npm

## Run locally

```sh
npm install
cp .env.example .env
npm run db:deploy
npm run dev
```

The API listens on `http://localhost:3000` by default. PostgreSQL must be running before the API starts. `GET /api/health` checks the service process and `GET /api/health/ready` checks database readiness.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (integer from 1 to 65535) |
| `NODE_ENV` | `development` | Runtime mode: `development`, `test`, or `production` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postgres?schema=public` | PostgreSQL connection URL; adjust username/password for your local PostgreSQL setup |

The local database target is PostgreSQL on port `5432`, database `postgres`. The example URL uses `postgres` as both the username and password; change those credentials if your local PostgreSQL setup differs. Prisma migrations are stored under `prisma/migrations`; use `npm run db:migrate -- --name <migration-name>` during development and `npm run db:deploy` to apply committed migrations in deployment environments.

## Data model

The initial schema defines users, projects, project memberships, tasks, comments, and attachment metadata. File bytes are not stored in PostgreSQL; attachments hold a storage key for a storage provider added in the collaboration milestone.

## Tests

```sh
npm test
```

The suite validates the Prisma schema, builds the TypeScript project, then runs the foundation and persistence tests. Future milestones add tests for each feature before that milestone is considered complete.

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
