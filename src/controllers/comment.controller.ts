import type { RequestHandler } from "express";
import { z, ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import { CommentService } from "../comments/comment.service.js";
import { commentBodySchema, commentRouteParamsSchema } from "../comments/comment.validation.js";

function invalidRequest(): AppError {
  return new AppError("Request data is invalid", 400, "VALIDATION_ERROR");
}

function userId(req: Parameters<RequestHandler>[0]): string {
  if (!req.auth) throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
  return req.auth.userId;
}

export class CommentController {
  constructor(private readonly comments: CommentService) {}

  create: RequestHandler = async (req, res) => {
    try {
      const params = commentRouteParamsSchema.parse(req.params);
      const body = commentBodySchema.parse(req.body);
      const comment = await this.comments.create(params.projectId, params.taskId, userId(req), body.body);
      res.status(201).json({ success: true, data: { comment } });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  list: RequestHandler = async (req, res) => {
    try {
      const params = commentRouteParamsSchema.parse(req.params);
      const comments = await this.comments.list(params.projectId, params.taskId, userId(req));
      res.status(200).json({ success: true, data: { comments } });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  update: RequestHandler = async (req, res) => {
    try {
      const params = commentRouteParamsSchema.extend({ commentId: z.string().uuid() }).parse(req.params);
      const body = commentBodySchema.parse(req.body);
      const comment = await this.comments.update(params.projectId, params.taskId, params.commentId, userId(req), body.body);
      res.status(200).json({ success: true, data: { comment } });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  delete: RequestHandler = async (req, res) => {
    try {
      const params = commentRouteParamsSchema.extend({ commentId: z.string().uuid() }).parse(req.params);
      await this.comments.delete(params.projectId, params.taskId, params.commentId, userId(req));
      res.status(204).end();
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };
}
