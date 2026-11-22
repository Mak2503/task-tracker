# TaskMaster API reference

This guide documents every route currently registered by the API. The machine-readable contract is [OpenAPI 3.1](./openapi.json). Examples use `http://localhost:3000/api` as the base URL and representative IDs/timestamps; use values returned by your own requests.

## Conventions

- Authenticated requests send `Authorization: Bearer <accessToken>` and JSON requests send `Content-Type: application/json`.
- Request bodies are strict: unknown fields are rejected. UUID path parameters must be valid UUIDs.
- Most JSON responses use `{ "success": true, "data": { ... } }`. `204 No Content` responses have no response body.
- Common error shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request data is invalid"
  }
}
```

Set values for these examples after creating your account and project:

```sh
API=http://localhost:3000/api
TOKEN=<access-token>
PROJECT_ID=11111111-1111-4111-8111-111111111111
TASK_ID=22222222-2222-4222-8222-222222222222
USER_ID=33333333-3333-4333-8333-333333333333
```

## Health

### `GET /health`

No authentication or body.

```http
GET /api/health
```

`200 OK`

```json
{ "success": true, "message": "API is running" }
```

### `GET /health/ready`

No authentication or body. Checks PostgreSQL connectivity.

```http
GET /api/health/ready
```

`200 OK`

```json
{ "success": true, "status": "ready", "database": "connected" }
```

When the database is unavailable, the endpoint returns `503` with `success: false`, `status: "unavailable"`, and `database: "disconnected"`.

## Authentication and profile

### `POST /auth/register`

No authentication.

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "email": "alex@example.com",
  "password": "a-long-unique-password",
  "displayName": "Alex Morgan"
}
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "33333333-3333-4333-8333-333333333333",
      "email": "alex@example.com",
      "displayName": "Alex Morgan",
      "createdAt": "2026-11-22T10:00:00.000Z",
      "updatedAt": "2026-11-22T10:00:00.000Z"
    }
  }
}
```

Passwords must be 12–72 UTF-8 bytes. Duplicate email returns `409`.

### `POST /auth/login`

No authentication.

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{ "email": "alex@example.com", "password": "a-long-unique-password" }
```

`200 OK` (token shortened here for readability)

```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresAt": "2026-11-22T10:15:00.000Z",
    "user": {
      "id": "33333333-3333-4333-8333-333333333333",
      "email": "alex@example.com",
      "displayName": "Alex Morgan",
      "createdAt": "2026-11-22T10:00:00.000Z",
      "updatedAt": "2026-11-22T10:00:00.000Z"
    }
  }
}
```

### `POST /auth/logout`

Requires authentication. No body.

```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
```

`204 No Content`; the current token is immediately revoked.

### `GET /users/me`

Requires authentication. No body.

```http
GET /api/users/me
Authorization: Bearer <accessToken>
```

`200 OK`, returning the current user's `user` profile as shown in the registration response.

### `PATCH /users/me`

Requires authentication.

```http
PATCH /api/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "displayName": "Alex M." }
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "33333333-3333-4333-8333-333333333333",
      "email": "alex@example.com",
      "displayName": "Alex M.",
      "createdAt": "2026-11-22T10:00:00.000Z",
      "updatedAt": "2026-11-22T10:05:00.000Z"
    }
  }
}
```

## Projects, members, and invitations

### `POST /projects`

Requires authentication. Creates a project and makes the caller its owner.

```http
POST /api/projects
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "name": "Website launch", "description": "Coordinate the release" }
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Website launch",
      "description": "Coordinate the release",
      "ownerId": "33333333-3333-4333-8333-333333333333",
      "createdAt": "2026-11-22T10:10:00.000Z",
      "updatedAt": "2026-11-22T10:10:00.000Z",
      "archivedAt": null
    }
  }
}
```

### `GET /projects`

Requires authentication. No body. Lists active projects the caller belongs to.

```http
GET /api/projects
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{ "success": true, "data": { "projects": [] } }
```

### `GET /projects/{projectId}`

Requires project membership. No body.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Website launch",
      "description": "Coordinate the release",
      "ownerId": "33333333-3333-4333-8333-333333333333",
      "createdAt": "2026-11-22T10:10:00.000Z",
      "updatedAt": "2026-11-22T10:10:00.000Z",
      "archivedAt": null
    }
  }
}
```

A project outside the caller's membership scope returns `404`.

### `PATCH /projects/{projectId}`

Requires project owner/admin role. Send at least one field.

```http
PATCH /api/projects/11111111-1111-4111-8111-111111111111
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "name": "Website launch 2027", "description": null }
```

`200 OK`: same response shape as `GET /projects/{projectId}`, with the updated project values.

### `DELETE /projects/{projectId}`

Requires project owner role. No body.

```http
DELETE /api/projects/11111111-1111-4111-8111-111111111111
Authorization: Bearer <accessToken>
```

`204 No Content`. This archives the project.

### `GET /projects/{projectId}/members`

Requires project membership. No body.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/members
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "members": [
      {
        "userId": "33333333-3333-4333-8333-333333333333",
        "role": "OWNER",
        "joinedAt": "2026-11-22T10:10:00.000Z",
        "user": { "email": "alex@example.com", "displayName": "Alex Morgan" }
      }
    ]
  }
}
```

### `PATCH /projects/{projectId}/members/{userId}`

Requires project owner role. `OWNER` cannot be assigned; only `ADMIN` or `MEMBER` are accepted.

```http
PATCH /api/projects/11111111-1111-4111-8111-111111111111/members/33333333-3333-4333-8333-333333333333
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "role": "ADMIN" }
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "member": {
      "projectId": "11111111-1111-4111-8111-111111111111",
      "userId": "33333333-3333-4333-8333-333333333333",
      "role": "ADMIN",
      "joinedAt": "2026-11-22T10:10:00.000Z"
    }
  }
}
```

### `DELETE /projects/{projectId}/members/{userId}`

Requires owner/admin role; admins can remove regular members only. No body.

```http
DELETE /api/projects/11111111-1111-4111-8111-111111111111/members/33333333-3333-4333-8333-333333333333
Authorization: Bearer <accessToken>
```

`204 No Content`.

### `POST /projects/{projectId}/invitations`

Requires project owner/admin role. Invitations are email-bound and expire after seven days.

```http
POST /api/projects/11111111-1111-4111-8111-111111111111/invitations
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "email": "sam@example.com" }
```

`201 Created` (the raw token is returned once; deliver it to the invitee securely)

```json
{
  "success": true,
  "data": {
    "invitation": {
      "id": "44444444-4444-4444-8444-444444444444",
      "email": "sam@example.com",
      "token": "<single-use-invitation-token>",
      "expiresAt": "2026-11-29T10:10:00.000Z"
    }
  }
}
```

Only a hash of the token is stored.

### `GET /projects/{projectId}/invitations`

Requires owner/admin role. No body. Only pending, unexpired invitations are listed.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/invitations
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "invitations": [
      {
        "id": "44444444-4444-4444-8444-444444444444",
        "email": "sam@example.com",
        "createdAt": "2026-11-22T10:10:00.000Z",
        "expiresAt": "2026-11-29T10:10:00.000Z"
      }
    ]
  }
}
```

### `DELETE /projects/{projectId}/invitations/{invitationId}`

Requires owner/admin role. No body.

```http
DELETE /api/projects/11111111-1111-4111-8111-111111111111/invitations/44444444-4444-4444-8444-444444444444
Authorization: Bearer <accessToken>
```

`204 No Content`.

### `POST /invitations/{token}/accept`

Requires authentication for the invited account. No body. The signed-in account's email must match the invite.

```http
POST /api/invitations/<single-use-invitation-token>/accept
Authorization: Bearer <invitee-access-token>
```

`200 OK`: `{ "success": true, "data": { "project": <accepted project> } }`.

## Tasks

Task statuses are `OPEN`, `IN_PROGRESS`, and `COMPLETED`. Creating/updating/reading tasks requires project membership. Archiving is allowed to the task creator or a project owner/admin.

### `POST /projects/{projectId}/tasks`

Requires authentication; any assignee must already be a project member.

```http
POST /api/projects/11111111-1111-4111-8111-111111111111/tasks
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "title": "Prepare launch checklist",
  "description": "Confirm the release steps with the team",
  "dueDate": "2026-12-01T17:00:00.000Z",
  "assigneeId": "55555555-5555-4555-8555-555555555555"
}
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "task": {
      "id": "22222222-2222-4222-8222-222222222222",
      "title": "Prepare launch checklist",
      "description": "Confirm the release steps with the team",
      "status": "OPEN",
      "dueDate": "2026-12-01T17:00:00.000Z",
      "projectId": "11111111-1111-4111-8111-111111111111",
      "creatorId": "33333333-3333-4333-8333-333333333333",
      "assigneeId": "55555555-5555-4555-8555-555555555555",
      "archivedAt": null,
      "createdAt": "2026-11-22T10:20:00.000Z",
      "updatedAt": "2026-11-22T10:20:00.000Z"
    }
  }
}
```

### `GET /projects/{projectId}/tasks`

Requires project membership. No body. Supported query parameters:

| Parameter | Meaning |
| --- | --- |
| `status` | `OPEN`, `IN_PROGRESS`, or `COMPLETED` |
| `assigneeId` | Member UUID or `unassigned` |
| `search` | Case-insensitive search in title and description |
| `dueAfter`, `dueBefore` | ISO date-time due-date bounds |
| `sortBy` | `title`, `status`, `dueDate`, `createdAt`, or `updatedAt` |
| `sortOrder` | `asc` or `desc` |
| `page` | 1-based page, default `1` |
| `pageSize` | 1–100, default `20` |

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/tasks?status=OPEN&search=launch&page=1&pageSize=20&sortBy=dueDate&sortOrder=asc
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "tasks": [],
    "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
  }
}
```

### `GET /tasks/assigned-to-me`

Requires authentication. No body. Supports the same task query parameters as the project task list.

```http
GET /api/tasks/assigned-to-me?status=IN_PROGRESS&page=1&pageSize=10
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "tasks": [],
    "pagination": { "page": 1, "pageSize": 10, "total": 0, "totalPages": 0 }
  }
}
```

### `GET /projects/{projectId}/tasks/{taskId}`

Requires project membership. No body.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "task": {
      "id": "22222222-2222-4222-8222-222222222222",
      "title": "Prepare launch checklist",
      "description": "Confirm the release steps with the team",
      "status": "OPEN",
      "dueDate": "2026-12-01T17:00:00.000Z",
      "projectId": "11111111-1111-4111-8111-111111111111",
      "creatorId": "33333333-3333-4333-8333-333333333333",
      "assigneeId": "55555555-5555-4555-8555-555555555555",
      "archivedAt": null,
      "createdAt": "2026-11-22T10:20:00.000Z",
      "updatedAt": "2026-11-22T10:20:00.000Z"
    }
  }
}
```

### `PATCH /projects/{projectId}/tasks/{taskId}`

Requires project membership. Send one or more task fields; set `assigneeId` or `dueDate` to `null` to clear them.

```http
PATCH /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "status": "COMPLETED", "title": "Launch checklist complete" }
```

`200 OK`: same response shape as `GET /projects/{projectId}/tasks/{taskId}`, with the updated task values.

### `DELETE /projects/{projectId}/tasks/{taskId}`

Archives the task; it does not physically delete the row.

```http
DELETE /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222
Authorization: Bearer <accessToken>
```

`204 No Content`.

## Comments

### `POST /projects/{projectId}/tasks/{taskId}/comments`

Requires project membership.

```http
POST /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/comments
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "body": "I will verify this before the release." }
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "comment": {
      "id": "66666666-6666-4666-8666-666666666666",
      "body": "I will verify this before the release.",
      "taskId": "22222222-2222-4222-8222-222222222222",
      "authorId": "33333333-3333-4333-8333-333333333333",
      "createdAt": "2026-11-22T10:30:00.000Z",
      "updatedAt": "2026-11-22T10:30:00.000Z",
      "author": { "id": "33333333-3333-4333-8333-333333333333", "displayName": "Alex Morgan" }
    }
  }
}
```

### `GET /projects/{projectId}/tasks/{taskId}/comments`

Requires project membership. No body.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/comments
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{ "success": true, "data": { "comments": [] } }
```

### `PATCH /projects/{projectId}/tasks/{taskId}/comments/{commentId}`

Only the comment author can edit it.

```http
PATCH /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/comments/66666666-6666-4666-8666-666666666666
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "body": "Verified and ready for release." }
```

`200 OK`: same response shape as `POST /projects/{projectId}/tasks/{taskId}/comments`, with the updated comment body and timestamp.

### `DELETE /projects/{projectId}/tasks/{taskId}/comments/{commentId}`

Comment author, project owner, or project admin may delete it. No body.

```http
DELETE /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/comments/66666666-6666-4666-8666-666666666666
Authorization: Bearer <accessToken>
```

`204 No Content`.

## Attachments

Attachments allow JPEG, PNG, WebP, PDF, plain text, and DOCX files up to 25 MiB. The bucket is private; transfer file bytes directly to object storage using the returned form fields, not to the API.

### `POST /projects/{projectId}/tasks/{taskId}/attachments`

Requires project membership. Creates pending metadata and a five-minute presigned POST policy.

```http
POST /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/attachments
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "fileName": "release-checklist.pdf", "contentType": "application/pdf", "sizeBytes": 12345 }
```

`201 Created` (signed URL and fields below are examples; always use returned values exactly)

```json
{
  "success": true,
  "data": {
    "attachment": {
      "id": "77777777-7777-4777-8777-777777777777",
      "fileName": "release-checklist.pdf",
      "contentType": "application/pdf",
      "sizeBytes": 12345,
      "taskId": "22222222-2222-4222-8222-222222222222",
      "uploadedById": "33333333-3333-4333-8333-333333333333",
      "status": "PENDING",
      "createdAt": "2026-11-22T10:35:00.000Z"
    },
    "uploadUrl": "http://localhost:9000/taskmaster",
    "uploadFields": {
      "key": "tasks/22222222-2222-4222-8222-222222222222/attachments/<random-id>",
      "Content-Type": "application/pdf",
      "policy": "<signed-policy>",
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-credential": "<signed-credential>",
      "x-amz-date": "20261122T103500Z",
      "x-amz-signature": "<signature>"
    },
    "uploadExpiresAt": "2026-11-22T10:40:00.000Z"
  }
}
```

POST a `multipart/form-data` body to `uploadUrl`, including every `uploadFields` value and the file under field name `file`. Then call the completion endpoint below. Never log or share signed upload values.

### `GET /projects/{projectId}/tasks/{taskId}/attachments`

Requires project membership. No body; only `AVAILABLE` attachments are returned.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/attachments
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{ "success": true, "data": { "attachments": [] } }
```

### `POST /projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/complete`

Only the uploader can complete a pending upload. No body. The API checks the stored object's content type and exact declared size.

```http
POST /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/attachments/77777777-7777-4777-8777-777777777777/complete
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "attachment": {
      "id": "77777777-7777-4777-8777-777777777777",
      "fileName": "release-checklist.pdf",
      "contentType": "application/pdf",
      "sizeBytes": 12345,
      "taskId": "22222222-2222-4222-8222-222222222222",
      "uploadedById": "33333333-3333-4333-8333-333333333333",
      "status": "AVAILABLE",
      "createdAt": "2026-11-22T10:35:00.000Z"
    }
  }
}
```

### `GET /projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/download`

Requires project membership and an available attachment. No body.

```http
GET /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/attachments/77777777-7777-4777-8777-777777777777/download
Authorization: Bearer <accessToken>
```

`200 OK`

```json
{
  "success": true,
  "data": {
    "downloadUrl": "http://localhost:9000/taskmaster/<signed-object-url>",
    "expiresInSeconds": 300
  }
}
```

### `DELETE /projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}`

Uploader, task creator, project owner, or project admin may delete it. No body.

```http
DELETE /api/projects/11111111-1111-4111-8111-111111111111/tasks/22222222-2222-4222-8222-222222222222/attachments/77777777-7777-4777-8777-777777777777
Authorization: Bearer <accessToken>
```

`204 No Content`.

## Real-time notifications

### `GET /notifications/events`

Requires authentication. No request body. The response is an SSE stream (`Content-Type: text/event-stream`). For bearer authentication, use `fetch` streaming and send the Authorization header. On reconnect, send the last received event ID in `Last-Event-ID`.

```http
GET /api/notifications/events
Authorization: Bearer <accessToken>
Last-Event-ID: <last-event-id>
```

Example stream frames:

```text
: connected

id: 88888888-8888-4888-8888-888888888888
event: task.updated
data: {"id":"88888888-8888-4888-8888-888888888888","type":"task.updated","projectId":"11111111-1111-4111-8111-111111111111","taskId":"22222222-2222-4222-8222-222222222222","actorId":"33333333-3333-4333-8333-333333333333","occurredAt":"2026-11-22T10:40:00.000Z","task":{"title":"Launch checklist complete","status":"COMPLETED","assigneeId":"55555555-5555-4555-8555-555555555555"}}

```

`task.assigned` is sent to the newly assigned member. `task.updated` is sent to current project members. The in-memory replay window is per API process; notifications are best-effort and not durable across restarts or replicas.
