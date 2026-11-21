import type { RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors/app-error.js";
import { ProjectService } from "../projects/project.service.js";
import {
  createProjectSchema,
  invitationIdSchema,
  invitationTokenSchema,
  inviteProjectMemberSchema,
  projectIdSchema,
  updateMemberRoleSchema,
  updateProjectSchema,
  userIdSchema,
} from "../projects/project.validation.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw new AppError("Request data is invalid", 400, "VALIDATION_ERROR");
    throw error;
  }
}

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
  return request.auth.userId;
}

export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  create: RequestHandler = async (req, res) => {
    const input = parse(createProjectSchema, req.body);
    const project = await this.projects.create(authenticatedUserId(req), input);
    res.status(201).json({ success: true, data: { project } });
  };

  list: RequestHandler = async (req, res) => {
    const projects = await this.projects.list(authenticatedUserId(req));
    res.status(200).json({ success: true, data: { projects } });
  };

  get: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const project = await this.projects.get(projectId, authenticatedUserId(req));
    res.status(200).json({ success: true, data: { project } });
  };

  update: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const input = parse(updateProjectSchema, req.body);
    const project = await this.projects.update(projectId, authenticatedUserId(req), input);
    res.status(200).json({ success: true, data: { project } });
  };

  archive: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    await this.projects.archive(projectId, authenticatedUserId(req));
    res.status(204).end();
  };

  listMembers: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const members = await this.projects.listMembers(projectId, authenticatedUserId(req));
    res.status(200).json({ success: true, data: { members } });
  };

  updateMemberRole: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const userId = parse(userIdSchema, req.params.userId);
    const { role } = parse(updateMemberRoleSchema, req.body);
    const member = await this.projects.updateMemberRole(projectId, userId, authenticatedUserId(req), role);
    res.status(200).json({ success: true, data: { member } });
  };

  removeMember: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const userId = parse(userIdSchema, req.params.userId);
    await this.projects.removeMember(projectId, userId, authenticatedUserId(req));
    res.status(204).end();
  };

  invite: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const { email } = parse(inviteProjectMemberSchema, req.body);
    const invitation = await this.projects.invite(projectId, authenticatedUserId(req), email);
    res.status(201).json({ success: true, data: { invitation } });
  };

  listInvitations: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const invitations = await this.projects.listInvitations(projectId, authenticatedUserId(req));
    res.status(200).json({ success: true, data: { invitations } });
  };

  revokeInvitation: RequestHandler = async (req, res) => {
    const projectId = parse(projectIdSchema, req.params.projectId);
    const invitationId = parse(invitationIdSchema, req.params.invitationId);
    await this.projects.revokeInvitation(projectId, invitationId, authenticatedUserId(req));
    res.status(204).end();
  };

  acceptInvitation: RequestHandler = async (req, res) => {
    const token = parse<string>(invitationTokenSchema, req.params.token);
    const project = await this.projects.acceptInvitation(token, authenticatedUserId(req));
    res.status(200).json({ success: true, data: { project } });
  };
}
