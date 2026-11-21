import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import { UserRepository } from "../repositories/user.repository.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { ProjectMembershipRepository, type MembershipRole } from "../repositories/project-membership.repository.js";
import { ProjectInvitationRepository } from "../repositories/project-invitation.repository.js";

export type CreateProjectInput = { name: string; description?: string };
export type UpdateProjectInput = { name?: string; description?: string | null };
export type AssignableRole = "ADMIN" | "MEMBER";

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export class ProjectService {
  private readonly invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly projects: ProjectRepository,
    private readonly memberships: ProjectMembershipRepository,
    private readonly invitations: ProjectInvitationRepository,
    private readonly users: UserRepository,
  ) {}

  create(userId: string, input: CreateProjectInput) {
    return this.projects.createWithOwner({ ...input, ownerId: userId });
  }

  list(userId: string) {
    return this.projects.listForMember(userId);
  }

  async get(projectId: string, userId: string) {
    const project = await this.projects.findForMember(projectId, userId);
    if (!project) throw this.projectNotFound();
    return project;
  }

  async update(projectId: string, userId: string, input: UpdateProjectInput) {
    await this.requireManager(projectId, userId);
    return this.projects.update(projectId, input);
  }

  async archive(projectId: string, userId: string): Promise<void> {
    const { project, membership } = await this.requireManager(projectId, userId);
    if (membership.role !== "OWNER") {
      throw new AppError("Only the project owner can archive the project", 403, "FORBIDDEN");
    }
    await this.projects.archive(project.id);
  }

  async listMembers(projectId: string, userId: string) {
    await this.get(projectId, userId);
    return this.memberships.listForProject(projectId);
  }

  async invite(projectId: string, invitedById: string, emailInput: string) {
    await this.requireManager(projectId, invitedById);
    const email = emailInput.trim().toLowerCase();
    const invitedUser = await this.users.findByEmail(email);
    if (invitedUser && await this.memberships.findMember(projectId, invitedUser.id)) {
      throw new AppError("This user is already a project member", 409, "ALREADY_A_MEMBER");
    }
    if (await this.invitations.findPending(projectId, email)) {
      throw new AppError("A pending invitation already exists for this email", 409, "INVITATION_EXISTS");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.invitationLifetimeMs);
    try {
      const invitation = await this.invitations.create({
        projectId,
        email,
        invitedById,
        tokenHash: hashInvitationToken(token),
        expiresAt,
      });
      return { id: invitation.id, email, token, expiresAt: invitation.expiresAt };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError("A pending invitation already exists for this email", 409, "INVITATION_EXISTS");
      }
      throw error;
    }
  }

  async listInvitations(projectId: string, userId: string) {
    await this.requireManager(projectId, userId);
    return this.invitations.listPending(projectId);
  }

  async revokeInvitation(projectId: string, invitationId: string, userId: string): Promise<void> {
    await this.requireManager(projectId, userId);
    if (!(await this.invitations.revoke(projectId, invitationId))) {
      throw new AppError("Invitation was not found or is no longer pending", 404, "INVITATION_NOT_FOUND");
    }
  }

  async acceptInvitation(token: string, userId: string) {
    const identity = await this.users.findIdentityById(userId);
    if (!identity) throw new AppError("User account was not found", 404, "USER_NOT_FOUND");

    let result;
    try {
      result = await this.invitations.accept(hashInvitationToken(token), userId, identity.email.toLowerCase());
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError("User is already a project member", 409, "ALREADY_A_MEMBER");
      }
      throw error;
    }

    switch (result.status) {
      case "ACCEPTED":
        return this.get(result.projectId, userId);
      case "EMAIL_MISMATCH":
        throw new AppError("Invitation belongs to a different email address", 403, "INVITATION_EMAIL_MISMATCH");
      case "EXPIRED":
        throw new AppError("Invitation has expired", 410, "INVITATION_EXPIRED");
      case "USED":
        throw new AppError("Invitation was already accepted or revoked", 410, "INVITATION_USED");
      case "ARCHIVED":
        throw new AppError("Project is archived", 410, "PROJECT_ARCHIVED");
      case "ALREADY_MEMBER":
        throw new AppError("User is already a project member", 409, "ALREADY_A_MEMBER");
      case "NOT_FOUND":
        throw new AppError("Invitation was not found", 404, "INVITATION_NOT_FOUND");
    }
  }

  async updateMemberRole(projectId: string, targetUserId: string, actorId: string, role: AssignableRole) {
    const { project, membership: actorMembership } = await this.requireManager(projectId, actorId);
    if (actorMembership.role !== "OWNER") {
      throw new AppError("Only the project owner can change member roles", 403, "FORBIDDEN");
    }
    const target = await this.memberships.findMember(projectId, targetUserId);
    if (!target) throw new AppError("Project member was not found", 404, "MEMBER_NOT_FOUND");
    if (targetUserId === project.ownerId || target.role === "OWNER") {
      throw new AppError("The project owner role cannot be changed", 403, "FORBIDDEN");
    }
    return this.memberships.updateRole(projectId, targetUserId, role);
  }

  async removeMember(projectId: string, targetUserId: string, actorId: string): Promise<void> {
    const { project, membership: actorMembership } = await this.requireManager(projectId, actorId);
    const target = await this.memberships.findMember(projectId, targetUserId);
    if (!target) throw new AppError("Project member was not found", 404, "MEMBER_NOT_FOUND");
    if (targetUserId === project.ownerId || target.role === "OWNER") {
      throw new AppError("The project owner cannot be removed", 403, "FORBIDDEN");
    }
    if (actorMembership.role === "ADMIN" && target.role !== "MEMBER") {
      throw new AppError("Project admins can only remove regular members", 403, "FORBIDDEN");
    }
    await this.memberships.remove(projectId, targetUserId);
  }

  private async requireManager(projectId: string, userId: string) {
    const project = await this.projects.findForMember(projectId, userId);
    if (!project) throw this.projectNotFound();
    const membership = await this.memberships.findRole(projectId, userId);
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
      throw new AppError("Project owner or admin privileges are required", 403, "FORBIDDEN");
    }
    return { project, membership: membership as { role: MembershipRole } };
  }

  private projectNotFound(): AppError {
    return new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
  }
}
