import { z } from "zod";

export const taskStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]);
const dueDateSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value));

export const projectIdParamSchema = z.string().uuid();
export const taskIdParamSchema = z.string().uuid();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000).nullable().optional(),
  dueDate: dueDateSchema.nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
}).strict();

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
  dueDate: dueDateSchema.nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  status: taskStatusSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: "At least one task field must be provided",
});

export const taskQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  assigneeId: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  dueAfter: dueDateSchema.optional(),
  dueBefore: dueDateSchema.optional(),
  sortBy: z.enum(["title", "status", "dueDate", "createdAt", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine((query) => !query.dueAfter || !query.dueBefore || query.dueAfter <= query.dueBefore, {
  message: "dueAfter must be earlier than or equal to dueBefore",
});
