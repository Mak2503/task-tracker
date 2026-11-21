import { z } from "zod";

export const commentRouteParamsSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  commentId: z.string().uuid().optional(),
});

export const commentBodySchema = z.object({
  body: z.string().trim().min(1).max(20_000),
}).strict();
