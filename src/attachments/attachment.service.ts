import { randomUUID } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import { AttachmentRepository } from "../repositories/attachment.repository.js";
import { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";
import { TaskService } from "../tasks/task.service.js";
import type { ObjectStorage } from "../storage/object-storage.js";

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type CreateAttachmentInput = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export class AttachmentService {
  private readonly uploadUrlLifetimeSeconds = 300;
  private readonly downloadUrlLifetimeSeconds = 300;

  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly tasks: TaskService,
    private readonly memberships: ProjectMembershipRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async createUpload(projectId: string, taskId: string, userId: string, input: CreateAttachmentInput) {
    const task = await this.tasks.get(projectId, taskId, userId);
    this.validateUpload(input);
    const key = `tasks/${task.id}/attachments/${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.uploadUrlLifetimeSeconds * 1000);
    const upload = await this.storage.createUploadUrl(key, input.contentType, input.sizeBytes, this.uploadUrlLifetimeSeconds);
    const attachment = await this.attachments.createPending({
      fileName: input.fileName.trim(),
      contentType: input.contentType,
      sizeBytes: BigInt(input.sizeBytes),
      storageKey: key,
      taskId,
      uploadedById: userId,
      uploadExpiresAt: expiresAt,
    });

    return {
      attachment: this.toPublicAttachment(attachment),
      uploadUrl: upload.url,
      uploadFields: upload.fields,
      uploadExpiresAt: expiresAt.toISOString(),
    };
  }

  async list(projectId: string, taskId: string, userId: string) {
    await this.tasks.get(projectId, taskId, userId);
    const attachments = await this.attachments.listAvailableForTask(taskId);
    return attachments.map((attachment) => this.toPublicAttachment(attachment));
  }

  async complete(projectId: string, taskId: string, attachmentId: string, userId: string) {
    await this.tasks.get(projectId, taskId, userId);
    const attachment = await this.attachments.findByIdInTask(attachmentId, taskId);
    if (!attachment) throw this.attachmentNotFound();
    if (attachment.uploadedById !== userId) {
      throw new AppError("Only the uploader can complete this upload", 403, "FORBIDDEN");
    }
    if (attachment.status === "AVAILABLE") return this.toPublicAttachment(attachment);
    if (attachment.status !== "PENDING") {
      throw new AppError("This upload is no longer available", 410, "UPLOAD_EXPIRED");
    }
    if (attachment.uploadExpiresAt <= new Date()) {
      try {
        await this.storage.delete(attachment.storageKey);
      } finally {
        await this.attachments.markFailed(attachment.id);
      }
      throw new AppError("The upload URL has expired", 410, "UPLOAD_EXPIRED");
    }

    let objectMetadata;
    try {
      objectMetadata = await this.storage.head(attachment.storageKey);
    } catch (error) {
      if (this.isObjectNotFound(error)) {
        throw new AppError("Upload has not reached storage yet", 409, "UPLOAD_NOT_FOUND");
      }
      throw error;
    }

    if (objectMetadata.sizeBytes !== Number(attachment.sizeBytes) || objectMetadata.contentType !== attachment.contentType) {
      try {
        await this.storage.delete(attachment.storageKey);
      } finally {
        await this.attachments.markFailed(attachment.id);
      }
      throw new AppError("Uploaded file does not match the declared size or content type", 422, "UPLOAD_METADATA_MISMATCH");
    }

    const available = await this.attachments.markAvailable(attachment.id);
    return this.toPublicAttachment(available);
  }

  async createDownloadUrl(projectId: string, taskId: string, attachmentId: string, userId: string) {
    await this.tasks.get(projectId, taskId, userId);
    const attachment = await this.attachments.findByIdInTask(attachmentId, taskId);
    if (!attachment || attachment.status !== "AVAILABLE") throw this.attachmentNotFound();
    const downloadUrl = await this.storage.createDownloadUrl(
      attachment.storageKey,
      attachment.contentType,
      attachment.fileName,
      this.downloadUrlLifetimeSeconds,
    );
    return { downloadUrl, expiresInSeconds: this.downloadUrlLifetimeSeconds };
  }

  async delete(projectId: string, taskId: string, attachmentId: string, userId: string): Promise<void> {
    const task = await this.tasks.get(projectId, taskId, userId);
    const attachment = await this.attachments.findByIdInTask(attachmentId, taskId);
    if (!attachment) throw this.attachmentNotFound();
    const membership = await this.memberships.findRole(projectId, userId);
    const canManage = membership?.role === "OWNER" || membership?.role === "ADMIN";
    if (attachment.uploadedById !== userId && task.creatorId !== userId && !canManage) {
      throw new AppError("Only the uploader, task creator, or project manager can delete this attachment", 403, "FORBIDDEN");
    }
    await this.storage.delete(attachment.storageKey);
    await this.attachments.delete(attachment.id);
  }

  private validateUpload(input: CreateAttachmentInput): void {
    if (input.sizeBytes < 1 || input.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(`Attachments must be between 1 byte and ${MAX_ATTACHMENT_SIZE_BYTES} bytes`, 413, "FILE_TOO_LARGE");
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(input.contentType)) {
      throw new AppError("This attachment content type is not allowed", 415, "UNSUPPORTED_FILE_TYPE");
    }
    if (!input.fileName.trim() || input.fileName.length > 255 || /[\\/\0\r\n]/.test(input.fileName)) {
      throw new AppError("Attachment filename is invalid", 400, "INVALID_FILENAME");
    }
  }

  private toPublicAttachment(attachment: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: bigint;
    taskId: string;
    uploadedById: string;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: Number(attachment.sizeBytes),
      taskId: attachment.taskId,
      uploadedById: attachment.uploadedById,
      status: attachment.status,
      createdAt: attachment.createdAt,
    };
  }

  private isObjectNotFound(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    return "name" in error && (error.name === "NotFound" || error.name === "NoSuchKey")
      || "$metadata" in error && typeof error.$metadata === "object" && error.$metadata !== null
        && "httpStatusCode" in error.$metadata && error.$metadata.httpStatusCode === 404;
  }

  private attachmentNotFound(): AppError {
    return new AppError("Attachment was not found", 404, "ATTACHMENT_NOT_FOUND");
  }
}
