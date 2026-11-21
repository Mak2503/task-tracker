import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED";
export type TaskSortField = "title" | "status" | "dueDate" | "createdAt" | "updatedAt";
export type TaskQuery = {
  status?: TaskStatus;
  assigneeId?: string | "unassigned";
  search?: string;
  dueAfter?: Date;
  dueBefore?: Date;
  sortBy: TaskSortField;
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
};

export class TaskRepository {
  constructor(private readonly client: PrismaClient) {}

  findById(id: string) {
    return this.client.task.findUnique({ where: { id } });
  }

  findActiveInProject(id: string, projectId: string) {
    return this.client.task.findFirst({
      where: { id, projectId, archivedAt: null, project: { archivedAt: null } },
    });
  }

  async listForProject(projectId: string, query: TaskQuery) {
    const where = this.buildWhere({ projectId }, query);
    const [tasks, total] = await Promise.all([
      this.client.task.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.client.task.count({ where }),
    ]);
    return { tasks, total };
  }

  async listAssignedTo(userId: string, query: TaskQuery) {
    const where = this.buildWhere({
      assigneeId: userId,
      project: { archivedAt: null, members: { some: { userId } } },
    }, query);
    const [tasks, total] = await Promise.all([
      this.client.task.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.client.task.count({ where }),
    ]);
    return { tasks, total };
  }

  create(input: {
    title: string;
    description?: string | null;
    dueDate?: Date | null;
    projectId: string;
    creatorId: string;
    assigneeId?: string | null;
  }) {
    return this.client.task.create({ data: input });
  }

  update(id: string, input: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    dueDate?: Date | null;
    assigneeId?: string | null;
  }) {
    return this.client.task.update({ where: { id }, data: input });
  }

  archive(id: string, archivedAt = new Date()) {
    return this.client.task.update({ where: { id }, data: { archivedAt } });
  }

  private buildWhere(base: Prisma.TaskWhereInput, query: TaskQuery): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = { ...base, archivedAt: null };
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId === "unassigned" ? null : query.assigneeId;
    if (query.dueAfter || query.dueBefore) {
      where.dueDate = {
        ...(query.dueAfter ? { gte: query.dueAfter } : {}),
        ...(query.dueBefore ? { lte: query.dueBefore } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private buildOrderBy(query: TaskQuery): Prisma.TaskOrderByWithRelationInput[] {
    return [
      { [query.sortBy]: query.sortOrder },
      { id: query.sortOrder },
    ];
  }
}
