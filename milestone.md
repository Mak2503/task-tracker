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
- Automated tests cover the health response and not-found error contract.

**Tests**
- Exercise the health and unknown-route endpoints over HTTP.
- Verify error status codes and JSON response structure.

## M2 — PostgreSQL persistence and domain model

**Status:** Complete

**Scope**
- Use PostgreSQL with Prisma; local development defaults to `localhost:5432`, database `postgres`.
- Define `User`, `Project`, `ProjectMember`, `Task`, `Comment`, and `Attachment` entities with appropriate relations, uniqueness rules, and indexes.
- Add schema migrations, database connection lifecycle, repositories, and service boundaries.
- Provide a database health/readiness check and document local migration commands.
- Add class-based repositories for initial user, project, task, comment, and attachment reads.

**Exit criteria**
- The Prisma schema validates and the initial migration is applied to the configured local database.
- The application connects at startup and disconnects on graceful shutdown.
- Repository methods cover the initial domain entities without putting database queries in route handlers.
- `/api/health/ready` reports PostgreSQL readiness.
- Automated tests cover database lifecycle/readiness and repository query scope/order; Prisma schema validation passes.

**Tests**
- Validate the Prisma schema in the test command.
- Unit-test connection/disconnection, healthy/unavailable readiness, and each repository's query filters and ordering with a stub Prisma client.
- Keep local database migration application as an integration check; a separate disposable test database will be configured before adding database-mutating automated tests.

## M3 — Authentication and user profiles

**Status:** Complete

**Scope**
- Register users with normalized unique email addresses and securely hashed passwords.
- Login with JWT access tokens; support logout through token revocation or short-lived token strategy.
- Add authenticated profile read and update endpoints.
- Add authentication middleware and shared authorization primitives.
- Test registration, login, logout/revocation, profile updates, password handling, and protected routes.

**Exit criteria**
- Invalid credentials, duplicate accounts, and unauthenticated access return consistent errors.
- Passwords are never stored or returned in plain text.
- Profile changes can only be made by the authenticated user.
- Automated tests cover valid and invalid credentials, duplicate registration, token lifecycle, and profile ownership.
- The auth-session migration is applied to the configured local PostgreSQL database.

**Tests**
- Exercise authentication and profile endpoints with valid, invalid, expired, and revoked credentials.
- Verify passwords are hashed and never appear in API responses.

## M4 — Projects and team membership

**Status:** Complete

**Scope**
- Create, list, view, update, and archive projects.
- Invite members by email, accept invitations, and manage pending invitations.
- List members and enforce owner/admin/member permissions for role changes and removals.
- Enforce project membership and role checks in services.
- Test membership invitation, role changes, and project isolation.

**Exit criteria**
- Project data is visible only to authorized members.
- Membership changes are validated and role-restricted.
- Automated tests prove members can access permitted projects while non-members cannot.
- Initial project/invitation migration is applied to the configured local PostgreSQL database.

**Tests**
- Cover transactional project/owner creation, project isolation, invitation expiry/email matching, hashed single-use tokens, and role/removal permissions.

## M5 — Task management

**Status:** Complete

**Scope**
- Create, read, update, delete/archive tasks within projects.
- Assign and reassign tasks to project members; support open/completed status and due dates.
- List tasks assigned to the current user and tasks in a project.
- Add validated filtering, sorting, pagination, and title/description search.
- Test task lifecycle, assignment rules, and query combinations.

**Exit criteria**
- Task mutations enforce project membership and assignment rules.
- Filters and sorting use an allowlist and pagination has stable ordering.
- Automated tests cover task access rules, status transitions, filtering, sorting, pagination, and search.
- Task archival migration is applied to the configured local PostgreSQL database.

**Tests**
- Verify task CRUD, assignment to project members, due dates, completion, list scoping, filter/sort allowlists, and pagination boundaries.

## M6 — Comments and attachments

**Status:** Complete

**Scope**
- Add, list, edit, and delete task comments with author and timestamp metadata.
- Add attachment metadata and upload/download handling with configurable storage.
- Enforce task/project authorization for every operation.
- Test comment and attachment access, validation, and storage failure behavior.

**Exit criteria**
- Only authorized project members can access task collaboration data.
- Upload size/type constraints and storage configuration are documented.
- Automated tests cover comment permissions and attachment metadata, limits, and denied access.
- Attachment status migration is applied to the configured local PostgreSQL database; local MinIO setup is documented.

**Tests**
- Verify comment create/edit/delete ownership and project membership.
- Exercise attachment type/size checks, metadata persistence, storage errors, and authorized download access.

## M7 — Real-time notifications

**Status:** Complete

**Scope**
- Publish task assignment and update events over authenticated Server-Sent Events.
- Scope notifications to current project members and the assigned user.
- Support heartbeat comments, bounded reconnect replay, and clean disconnects.

**Exit criteria**
- Notifications are scoped to authorized users and do not block normal task operations.
- Automated tests verify notification authorization, reconnect replay, and subscriber cleanup.

**Tests**
- Verify assigned/updated events reach only authorized users and reconnect behavior is stable.
- Verify expired replay cursors and disconnected streams are handled safely.

## M8 — API and operational readiness

**Status:** Next

**Scope**
- Publish OpenAPI documentation and examples for the completed endpoints.
- Optionally add AI generated task descriptions or summaries through a provider abstraction.
- Add focused automated coverage for authentication, authorization, task workflows, and collaboration.
- Document deployment configuration, migrations, logging, and backup expectations.
- Run end-to-end smoke tests for the documented user workflows.

**Exit criteria**
- Documented workflows match the implemented API.
- Build and automated checks pass in a clean environment.
- End-to-end tests cover registration through project task collaboration and documentation examples remain valid.

**Tests**
- Run the complete unit, integration, and end-to-end suites against a disposable PostgreSQL database.
- Verify migrations from an empty database and check health/readiness behavior in a clean environment.
