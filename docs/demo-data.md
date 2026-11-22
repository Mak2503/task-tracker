# Seed a TaskMaster demo workspace

The demo seeder calls the running API and object store to create real sample data. It registers or logs into two local demo accounts, creates a new project on each run, invites a member, assigns roles, creates tasks in different states, adds and edits comments, uploads and downloads a real text attachment, and verifies SSE notifications. It leaves the project and its active examples in the database; one extra task is archived as a sample. The invite used for the demo is accepted, and a separate pending invite is created and revoked.

## Start the services

Configure `.env` with a valid `JWT_SECRET` and local PostgreSQL URL. Start PostgreSQL and MinIO, apply migrations, then start the API:

```sh
docker compose up -d
npm run db:deploy
npm run dev
```

In another terminal, run:

```sh
npm run demo:seed
```

The seed process exits with an error if an API call fails, storage upload/download fails, SSE events are not received, or `NODE_ENV=production`.

## Demo accounts

Default development credentials:

| Role | Email | Password |
| --- | --- | --- |
| Project owner | `taskmaster-owner@example.test` | `TaskMaster-Demo-Owner-2026!` |
| Project member/admin | `taskmaster-member@example.test` | `TaskMaster-Demo-Member-2026!` |

The script logs both emails and the generated project/task IDs at completion. It logs out the seeding sessions; sign in with the credentials above to use the accounts afterward. If these email addresses already exist, their passwords must match the configured demo credentials.

Override credentials or API base URL by exporting `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`, `DEMO_MEMBER_EMAIL`, `DEMO_MEMBER_PASSWORD`, or `DEMO_API_URL` before running the command. For example:

```sh
DEMO_API_URL=http://localhost:3000/api npm run demo:seed
```

Each run creates a new timestamped project. To remove a demo workspace, archive its project through `DELETE /api/projects/{projectId}` as the owner. Remove attachments before archiving their task if you need to reclaim object storage.

The seeder exercises registration/login, profile updates, project CRUD/listing, invitations and acceptance/revocation, membership listing and role changes, task creation/list/search/filter/assignment/status/archive, comments CRUD and moderation, attachment upload/complete/list/download, SSE notifications, and logout. See [the API reference](./api-reference.md) for route details.
