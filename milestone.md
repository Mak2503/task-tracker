# TaskMaster delivery milestones

This plan delivers the backend in small, verifiable increments. Each milestone should leave the application buildable and keep API, domain, and persistence responsibilities separated. Optional real-time and AI work comes after the core workflows.

## M1 — Project and API foundation

**Status:** Complete

**Scope**
- TypeScript and Express application bootstrap.
- Startup validation for `PORT` and `NODE_ENV`.
- JSON body limits, health endpoint, not-found handling, and consistent error responses.
- Local setup and API conventions documented.

**Exit criteria**
- `npm run build` succeeds.
- `GET /api/health` responds successfully.
- Unknown routes return the documented JSON error format.

## M2 — PostgreSQL persistence and domain model

**Status:** Next

**Scope**
- Use PostgreSQL with Prisma; local development defaults to `localhost:5432`, database `postgres`.
- Define `User`, `Project`, `ProjectMember`, `Task`, `Comment`, and `Attachment` entities with appropriate relations, uniqueness rules, and indexes.
- Add schema migrations, database connection lifecycle, repositories, and service boundaries.
- Provide a database health/readiness check and document local migration commands.

**Exit criteria**
- The Prisma schema validates and the initial migration can be applied to the configured local database.
- The application can connect and disconnect cleanly.
- Repository methods cover the initial domain entities without putting database queries in route handlers.

## M3 — Authentication and user profiles

**Scope**
- Register users with normalized unique email addresses and securely hashed passwords.
- Login with JWT access tokens; support logout through token revocation or short-lived token strategy.
- Add authenticated profile read and update endpoints.
- Add authentication middleware and shared authorization primitives.

**Exit criteria**
- Invalid credentials, duplicate accounts, and unauthenticated access return consistent errors.
- Passwords are never stored or returned in plain text.
- Profile changes can only be made by the authenticated user.

## M4 — Projects and team membership

**Scope**
- Create, list, view, update, and archive projects.
- Invite members and manage project membership and roles.
- Enforce project membership and role checks in services.

**Exit criteria**
- Project data is visible only to authorized members.
- Membership changes are validated and role-restricted.

## M5 — Task management

**Scope**
- Create, read, update, delete/archive tasks within projects.
- Assign and reassign tasks to project members; support open/completed status and due dates.
- List tasks assigned to the current user and tasks in a project.
- Add validated filtering, sorting, pagination, and title/description search.

**Exit criteria**
- Task mutations enforce project membership and assignment rules.
- Filters and sorting use an allowlist and pagination has stable ordering.

## M6 — Comments and attachments

**Scope**
- Add, list, edit, and delete task comments with author and timestamp metadata.
- Add attachment metadata and upload/download handling with configurable storage.
- Enforce task/project authorization for every operation.

**Exit criteria**
- Only authorized project members can access task collaboration data.
- Upload size/type constraints and storage configuration are documented.

## M7 — Optional notifications and AI assistance

**Scope**
- Publish task assignment and update events using Server-Sent Events or WebSockets.
- Optionally generate task descriptions or summaries through a provider abstraction.

**Exit criteria**
- Notifications are scoped to authorized users and do not block normal task operations.
- AI integration is opt-in, configured through environment variables, and handles provider failures safely.

## M8 — API and operational readiness

**Scope**
- Publish OpenAPI documentation and examples for the completed endpoints.
- Add focused automated coverage for authentication, authorization, task workflows, and collaboration.
- Document deployment configuration, migrations, logging, and backup expectations.

**Exit criteria**
- Documented workflows match the implemented API.
- Build and automated checks pass in a clean environment.
