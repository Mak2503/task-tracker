import { z } from "zod";

export const attachmentRouteParamsSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  attachmentId: z.string().uuid().optional(),
});

export const createAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(150),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
