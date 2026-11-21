import { z } from "zod";

export const projectIdSchema = z.string().uuid();
export const userIdSchema = z.string().uuid();
export const invitationIdSchema = z.string().uuid();
export const invitationTokenSchema = z.string().min(32).max(100);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
}).strict();

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: "At least one project field must be provided",
});

export const inviteProjectMemberSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
}).strict();

export const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
}).strict();
