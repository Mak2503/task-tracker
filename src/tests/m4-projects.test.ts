import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { ProjectService } from "../projects/project.service.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import type { ProjectRepository as ProjectRepositoryType } from "../repositories/project.repository.js";
import type { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";
import type { ProjectInvitationRepository } from "../repositories/project-invitation.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";

const project = {
  id: "project-1",
  name: "TaskMaster",
  description: null,
  ownerId: "owner-1",
  archivedAt: null,
};

function createHarness(options: {
  actorRole?: "OWNER" | "ADMIN" | "MEMBER" | null;
  targetMember?: { role: "OWNER" | "ADMIN" | "MEMBER" } | null;
  acceptance?: string;
} = {}) {
  const calls: Array<{ repository: string; method: string; args: unknown[] }> = [];
  let storedInvitation: Record<string, unknown> | undefined;
  const projectRepository = {
    findForMember: async (...args: unknown[]) => {
      calls.push({ repository: "project", method: "findForMember", args });
      return options.actorRole ? project : null;
    },
    listForMember: async (...args: unknown[]) => {
      calls.push({ repository: "project", method: "listForMember", args });
      return [project];
    },
    createWithOwner: async (...args: unknown[]) => {
      calls.push({ repository: "project", method: "createWithOwner", args });
      return project;
    },
    update: async (...args: unknown[]) => {
      calls.push({ repository: "project", method: "update", args });
      return { ...project, ...(args[1] as Record<string, unknown>) };
    },
    archive: async (...args: unknown[]) => {
      calls.push({ repository: "project", method: "archive", args });
    },
  };
  const membershipRepository = {
    findRole: async (...args: unknown[]) => {
      calls.push({ repository: "membership", method: "findRole", args });
      return options.actorRole ? { role: options.actorRole } : null;
    },
    findMember: async (...args: unknown[]) => {
      calls.push({ repository: "membership", method: "findMember", args });
      if (args[1] === project.ownerId) return { projectId: project.id, userId: project.ownerId, role: "OWNER" };
      return options.targetMember ? { projectId: project.id, userId: args[1], ...options.targetMember } : null;
    },
    listForProject: async (...args: unknown[]) => {
      calls.push({ repository: "membership", method: "listForProject", args });
      return [];
    },
    updateRole: async (...args: unknown[]) => {
      calls.push({ repository: "membership", method: "updateRole", args });
      return { projectId: args[0], userId: args[1], role: args[2] };
    },
    remove: async (...args: unknown[]) => {
      calls.push({ repository: "membership", method: "remove", args });
    },
  };
  const invitationRepository = {
    findPending: async (...args: unknown[]) => {
      calls.push({ repository: "invitation", method: "findPending", args });
      return null;
    },
    create: async (input: Record<string, unknown>) => {
      calls.push({ repository: "invitation", method: "create", args: [input] });
      storedInvitation = input;
      return { id: "invite-1", ...input };
    },
    listPending: async (...args: unknown[]) => {
      calls.push({ repository: "invitation", method: "listPending", args });
      return [];
    },
    revoke: async (...args: unknown[]) => {
      calls.push({ repository: "invitation", method: "revoke", args });
      return true;
    },
    accept: async (...args: unknown[]) => {
      calls.push({ repository: "invitation", method: "accept", args });
      return { status: options.acceptance ?? "ACCEPTED", projectId: project.id };
    },
  };
  const userRepository = {
    findByEmail: async (...args: unknown[]) => {
      calls.push({ repository: "user", method: "findByEmail", args });
      return null;
    },
    findIdentityById: async (...args: unknown[]) => {
      calls.push({ repository: "user", method: "findIdentityById", args });
      return { id: args[0], email: "invite@example.test" };
    },
  };
  const service = new ProjectService(
    projectRepository as unknown as ProjectRepositoryType,
    membershipRepository as unknown as ProjectMembershipRepository,
    invitationRepository as unknown as ProjectInvitationRepository,
    userRepository as unknown as UserRepository,
  );
  return { service, calls, get storedInvitation() { return storedInvitation; } };
}

test("project creation delegates owner membership creation to the project repository transaction", async () => {
  const calls: unknown[] = [];
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      project: { create: async (args: unknown) => {
        calls.push(["project.create", args]);
        return { id: "project-created" };
      } },
      projectMember: { create: async (args: unknown) => calls.push(["projectMember.create", args]) },
    }),
  } as unknown as PrismaClient;
  const repository = new ProjectRepository(prisma);

  await repository.createWithOwner({ name: "New", ownerId: "owner-1" });

  assert.deepEqual(calls, [
    ["project.create", { data: { name: "New", description: undefined, ownerId: "owner-1" } }],
    ["projectMember.create", { data: { projectId: "project-created", userId: "owner-1", role: "OWNER" } }],
  ]);
});

test("project access is scoped to membership and hides projects from non-members", async () => {
  const { service } = createHarness();

  await assert.rejects(service.get("project-1", "outsider-1"), (error: unknown) =>
    error instanceof AppError && error.statusCode === 404,
  );
});

test("members can list projects and members, while ordinary members cannot invite", async () => {
  const member = createHarness({ actorRole: "MEMBER" });
  assert.deepEqual(await member.service.list("member-1"), [project]);
  await member.service.listMembers("project-1", "member-1");
  await assert.rejects(member.service.invite("project-1", "member-1", "new@example.test"), (error: unknown) =>
    error instanceof AppError && error.statusCode === 403,
  );
  assert.equal(member.calls.some((call) => call.method === "create"), false);
});

test("only project managers can update project details and only owners can archive", async () => {
  const owner = createHarness({ actorRole: "OWNER" });
  const updated = await owner.service.update("project-1", "owner-1", { name: "Updated" });
  assert.equal(updated.name, "Updated");
  await owner.service.archive("project-1", "owner-1");

  const member = createHarness({ actorRole: "MEMBER" });
  await assert.rejects(member.service.update("project-1", "member-1", { name: "Blocked" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );

  const admin = createHarness({ actorRole: "ADMIN" });
  await assert.rejects(admin.service.archive("project-1", "admin-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
});

test("invitation tokens are normalized, single-use material stored only as a hash", async () => {
  const harness = createHarness({ actorRole: "OWNER" });

  const invitation = await harness.service.invite("project-1", "owner-1", " Invitee@Example.Test ");
  const stored = harness.storedInvitation as { email: string; tokenHash: string; expiresAt: Date };
  const createCall = harness.calls.find((call) => call.repository === "invitation" && call.method === "create");

  assert.equal(invitation.email, "invitee@example.test");
  assert.equal(stored.email, "invitee@example.test");
  assert.equal(stored.tokenHash, createHash("sha256").update(invitation.token).digest("hex"));
  assert.notEqual(stored.tokenHash, invitation.token);
  assert.ok(stored.expiresAt.getTime() > Date.now());
  assert.equal(JSON.stringify(createCall).includes(invitation.token), false);
});

test("invitation acceptance checks the signed-in user's email and adds membership", async () => {
  const { service, calls } = createHarness({ actorRole: "MEMBER", acceptance: "ACCEPTED" });
  const projectResult = await service.acceptInvitation("opaque-invite-token-value-123456", "new-user-1");
  const acceptCall = calls.find((call) => call.repository === "invitation" && call.method === "accept");

  assert.equal(projectResult.id, project.id);
  assert.deepEqual(acceptCall?.args.slice(1), ["new-user-1", "invite@example.test"]);
  assert.notEqual(acceptCall?.args[0], "opaque-invite-token-value-123456");
});

test("invitation acceptance rejects mismatched email, expired, and used invitations", async () => {
  const emailMismatch = createHarness({ acceptance: "EMAIL_MISMATCH" });
  await assert.rejects(emailMismatch.service.acceptInvitation("token-value-at-least-thirty-two-characters", "user-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );

  const expired = createHarness({ acceptance: "EXPIRED" });
  await assert.rejects(expired.service.acceptInvitation("token-value-at-least-thirty-two-characters", "user-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 410,
  );

  const used = createHarness({ acceptance: "USED" });
  await assert.rejects(used.service.acceptInvitation("token-value-at-least-thirty-two-characters", "user-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 410,
  );
});

test("admins can revoke pending invitations but regular members cannot", async () => {
  const admin = createHarness({ actorRole: "ADMIN" });
  await admin.service.revokeInvitation("project-1", "invite-id", "admin-1");
  assert.ok(admin.calls.some((call) => call.method === "revoke"));

  const member = createHarness({ actorRole: "MEMBER" });
  await assert.rejects(member.service.revokeInvitation("project-1", "invite-id", "member-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
});

test("only the owner can change roles and admins cannot change other admins", async () => {
  const owner = createHarness({ actorRole: "OWNER", targetMember: { role: "MEMBER" } });
  const updated = await owner.service.updateMemberRole("project-1", "member-2", "owner-1", "ADMIN");
  assert.equal(updated.role, "ADMIN");

  const adminTarget = createHarness({ actorRole: "ADMIN", targetMember: { role: "ADMIN" } });
  await assert.rejects(adminTarget.service.updateMemberRole("project-1", "admin-2", "admin-1", "MEMBER"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
  await assert.rejects(adminTarget.service.removeMember("project-1", "admin-2", "admin-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
});

test("project owner role cannot be removed or reassigned", async () => {
  const owner = createHarness({ actorRole: "OWNER" });
  await assert.rejects(owner.service.updateMemberRole("project-1", project.ownerId, "owner-1", "MEMBER"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
  await assert.rejects(owner.service.removeMember("project-1", project.ownerId, "owner-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
});
