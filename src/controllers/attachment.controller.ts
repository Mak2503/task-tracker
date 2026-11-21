import { z, ZodError } from "zod";
import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { AttachmentService } from "../attachments/attachment.service.js";
import { attachmentRouteParamsSchema, createAttachmentSchema } from "../attachments/attachment.validation.js";

function invalidRequest(): AppError {
  return new AppError("Request data is invalid", 400, "VALIDATION_ERROR");
}

function userId(req: Parameters<RequestHandler>[0]): string {
  if (!req.auth) throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
  return req.auth.userId;
}

export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}

  createUpload: RequestHandler = async (req, res) => {
    try {
      const params = attachmentRouteParamsSchema.parse(req.params);
      const input = createAttachmentSchema.parse(req.body);
      const result = await this.attachments.createUpload(params.projectId, params.taskId, userId(req), input);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  list: RequestHandler = async (req, res) => {
    try {
      const params = attachmentRouteParamsSchema.parse(req.params);
      const attachments = await this.attachments.list(params.projectId, params.taskId, userId(req));
      res.status(200).json({ success: true, data: { attachments } });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  complete: RequestHandler = async (req, res) => {
    try {
      const params = attachmentRouteParamsSchema.extend({ attachmentId: z.string().uuid() }).parse(req.params);
      const attachment = await this.attachments.complete(params.projectId, params.taskId, params.attachmentId, userId(req));
      res.status(200).json({ success: true, data: { attachment } });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  download: RequestHandler = async (req, res) => {
    try {
      const params = attachmentRouteParamsSchema.extend({ attachmentId: z.string().uuid() }).parse(req.params);
      const download = await this.attachments.createDownloadUrl(params.projectId, params.taskId, params.attachmentId, userId(req));
      res.status(200).json({ success: true, data: download });
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };

  delete: RequestHandler = async (req, res) => {
    try {
      const params = attachmentRouteParamsSchema.extend({ attachmentId: z.string().uuid() }).parse(req.params);
      await this.attachments.delete(params.projectId, params.taskId, params.attachmentId, userId(req));
      res.status(204).end();
    } catch (error) {
      if (error instanceof ZodError) throw invalidRequest();
      throw error;
    }
  };
}
