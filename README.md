# TaskMaster API

A TypeScript and Express backend for collaborative task tracking. The implementation is being delivered in milestones; see [milestone.md](./milestone.md) for scope and progress.

## Requirements

- Node.js 20 or later
- npm

## Run locally

```sh
npm install
cp .env.example .env
npm run dev
```

The API listens on `http://localhost:3000` by default. `GET /api/health` returns a simple service health response.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (integer from 1 to 65535) |
| `NODE_ENV` | `development` | Runtime mode: `development`, `test`, or `production` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postgres?schema=public` | PostgreSQL connection URL; adjust username/password for your local PostgreSQL setup |

The local database target is PostgreSQL on port `5432`, database `postgres`. The schema and database integration are being added in M2; the URL is configured now so the project has one consistent local connection setting.

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
