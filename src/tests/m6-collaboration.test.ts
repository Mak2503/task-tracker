import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../errors/app-error.js";
import { CommentService } from "../comments/comment.service.js";
import { commentBodySchema } from "../comments/comment.validation.js";
import { AttachmentService, MAX_ATTACHMENT_SIZE_BYTES } from "../attachments/attachment.service.js";
import { createAttachmentSchema } from "../attachments/attachment.validation.js";
import type { CommentRepository } from "../repositories/comment.repository.js";
import type { AttachmentRepository } from "../repositories/attachment.repository.js";
import type { ProjectMembershipRepository } from "../repositories/project-membership.repository.js";
import type { TaskService } from "../tasks/task.service.js";
import type { ObjectStorage } from "../storage/object-storage.js";

const task = { id: "task-1", projectId: "project-1", creatorId: "creator-1" };
const comment = { id: "comment-1", taskId: task.id, authorId: "author-1", body: "Initial" };

function createCommentHarness(options: { actorRole?: "OWNER" | "ADMIN" | "MEMBER"; commentAuthor?: string } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const repository = {
    create: async (...args: unknown[]) => { calls.push({ method: "create", args }); return comment; },
    listForTask: async (...args: unknown[]) => { calls.push({ method: "list", args }); return [comment]; },
    findByIdInTask: async (...args: unknown[]) => {
      calls.push({ method: "find", args });
      return { ...comment, authorId: options.commentAuthor ?? comment.authorId };
    },
    update: async (...args: unknown[]) => { calls.push({ method: "update", args }); return { ...comment, body: args[1] }; },
    delete: async (...args: unknown[]) => { calls.push({ method: "delete", args }); },
  } as unknown as CommentRepository;
  const tasks = { get: async (...args: unknown[]) => { calls.push({ method: "taskAccess", args }); return task; } } as unknown as TaskService;
  const memberships = { findRole: async () => options.actorRole ? { role: options.actorRole } : null } as unknown as ProjectMembershipRepository;
  return { service: new CommentService(repository, tasks, memberships), calls };
}

type StoredAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
  storageKey: string;
  taskId: string;
  uploadedById: string;
  uploadExpiresAt: Date;
  status: "PENDING" | "AVAILABLE" | "FAILED";
  createdAt: Date;
};

function createAttachmentHarness(options: {
  actorRole?: "OWNER" | "ADMIN" | "MEMBER";
  uploaderId?: string;
  objectSize?: number;
  objectContentType?: string;
  expired?: boolean;
  missingObject?: boolean;
  signingFails?: boolean;
  deleteFails?: boolean;
} = {}) {
  const calls: string[] = [];
  let attachment: StoredAttachment = {
    id: "attachment-1",
    fileName: "design.pdf",
    contentType: "application/pdf",
    sizeBytes: 512n,
    storageKey: "tasks/task-1/attachments/object-key",
    taskId: task.id,
    uploadedById: options.uploaderId ?? "author-1",
    uploadExpiresAt: new Date(Date.now() + (options.expired ? -1000 : 300_000)),
    status: "PENDING",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const repository = {
    createPending: async (input: Omit<StoredAttachment, "id" | "status" | "createdAt">) => {
      calls.push("createPending");
      attachment = { ...input, id: "new-attachment", status: "PENDING", createdAt: new Date() };
      return attachment;
    },
    listAvailableForTask: async () => [attachment.status === "AVAILABLE" ? attachment : null].filter(Boolean),
    findByIdInTask: async () => attachment,
    markAvailable: async () => { calls.push("markAvailable"); attachment.status = "AVAILABLE"; return attachment; },
    markFailed: async () => { calls.push("markFailed"); attachment.status = "FAILED"; return attachment; },
    delete: async () => { calls.push("deleteMetadata"); },
  } as unknown as AttachmentRepository;
  const tasks = { get: async () => task } as unknown as TaskService;
  const memberships = {
    findRole: async () => options.actorRole ? { role: options.actorRole } : { role: "MEMBER" },
  } as unknown as ProjectMembershipRepository;
  const storage = {
    createUploadUrl: async (...args: unknown[]) => {
      calls.push("createUploadUrl");
      if (options.signingFails) throw new Error("storage signing failed");
      return { url: "https://storage.test/upload", fields: { key: "signed-key", policy: "signed-policy" } };
    },
    createDownloadUrl: async (...args: unknown[]) => { calls.push("createDownloadUrl"); return "https://storage.test/download"; },
    head: async () => {
      calls.push("head");
      if (options.missingObject) throw Object.assign(new Error("not found"), { name: "NotFound" });
      return {
        sizeBytes: options.objectSize ?? Number(attachment.sizeBytes),
        contentType: options.objectContentType ?? attachment.contentType,
      };
    },
    delete: async () => {
      calls.push("deleteObject");
      if (options.deleteFails) throw new Error("storage delete failed");
    },
  } as unknown as ObjectStorage;
  return {
    service: new AttachmentService(repository, tasks, memberships, storage),
    calls,
    get attachment() { return attachment; },
  };
}

test("comments are scoped to task membership and include author-safe data", async () => {
  const harness = createCommentHarness();
  await harness.service.create("project-1", "task-1", "author-1", "A comment");
  const listed = await harness.service.list("project-1", "task-1", "author-1");

  assert.equal(listed.length, 1);
  assert.ok(harness.calls.some((call) => call.method === "taskAccess"));
  assert.ok(harness.calls.some((call) => call.method === "create"));
});

test("comment edits are author-only while project managers can moderate", async () => {
  const author = createCommentHarness({ commentAuthor: "author-1" });
  await author.service.update("project-1", "task-1", "comment-1", "author-1", "Edited");
  assert.ok(author.calls.some((call) => call.method === "update"));

  const member = createCommentHarness({ commentAuthor: "other-user" });
  await assert.rejects(member.service.update("project-1", "task-1", "comment-1", "author-1", "Edited"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
  await assert.rejects(member.service.delete("project-1", "task-1", "comment-1", "author-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );

  const admin = createCommentHarness({ actorRole: "ADMIN", commentAuthor: "other-user" });
  await admin.service.delete("project-1", "task-1", "comment-1", "admin-1");
  assert.ok(admin.calls.some((call) => call.method === "delete"));
});

test("attachment upload reserves private metadata and returns a short-lived signed URL", async () => {
  const harness = createAttachmentHarness();
  const result = await harness.service.createUpload("project-1", "task-1", "author-1", {
    fileName: "design.pdf",
    contentType: "application/pdf",
    sizeBytes: 512,
  });

  assert.equal(result.uploadUrl, "https://storage.test/upload");
  assert.deepEqual(result.uploadFields, { key: "signed-key", policy: "signed-policy" });
  assert.equal(result.attachment.status, "PENDING");
  assert.equal(result.attachment.sizeBytes, 512);
  assert.equal("storageKey" in result.attachment, false);
  assert.ok(harness.calls.includes("createPending"));
});

test("attachment upload rejects unsafe types, paths, zero sizes, and files above the limit", async () => {
  const harness = createAttachmentHarness();
  await assert.rejects(harness.service.createUpload("project-1", "task-1", "author-1", {
    fileName: "script.html", contentType: "text/html", sizeBytes: 100,
  }), (error: unknown) => error instanceof AppError && error.statusCode === 415);
  await assert.rejects(harness.service.createUpload("project-1", "task-1", "author-1", {
    fileName: "../design.pdf", contentType: "application/pdf", sizeBytes: 100,
  }), (error: unknown) => error instanceof AppError && error.statusCode === 400);
  await assert.rejects(harness.service.createUpload("project-1", "task-1", "author-1", {
    fileName: "design.pdf", contentType: "application/pdf", sizeBytes: 0,
  }), (error: unknown) => error instanceof AppError && error.statusCode === 413);
  await assert.rejects(harness.service.createUpload("project-1", "task-1", "author-1", {
    fileName: "large.pdf", contentType: "application/pdf", sizeBytes: MAX_ATTACHMENT_SIZE_BYTES + 1,
  }), (error: unknown) => error instanceof AppError && error.statusCode === 413);
  assert.equal(harness.calls.includes("createUploadUrl"), false);
});

test("upload completion verifies stored size and content type before making metadata available", async () => {
  const harness = createAttachmentHarness();
  const verified = await harness.service.complete("project-1", "task-1", "attachment-1", "author-1");
  assert.equal(verified.status, "AVAILABLE");
  assert.ok(harness.calls.includes("head"));
  assert.ok(harness.calls.includes("markAvailable"));

  const mismatch = createAttachmentHarness({ objectSize: 300 });
  await assert.rejects(mismatch.service.complete("project-1", "task-1", "attachment-1", "author-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 422,
  );
  assert.ok(mismatch.calls.includes("deleteObject"));
  assert.ok(mismatch.calls.includes("markFailed"));
});

test("only the uploader can complete pending uploads and expired uploads are failed", async () => {
  const otherUser = createAttachmentHarness({ uploaderId: "another-user" });
  await assert.rejects(otherUser.service.complete("project-1", "task-1", "attachment-1", "author-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );

  const expired = createAttachmentHarness({ expired: true });
  await assert.rejects(expired.service.complete("project-1", "task-1", "attachment-1", "author-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 410,
  );
  assert.ok(expired.calls.includes("deleteObject"));
  assert.ok(expired.calls.includes("markFailed"));
});

test("storage failures do not expose incomplete metadata or remove metadata before object deletion", async () => {
  const signingFailure = createAttachmentHarness({ signingFails: true });
  await assert.rejects(signingFailure.service.createUpload("project-1", "task-1", "author-1", {
    fileName: "design.pdf", contentType: "application/pdf", sizeBytes: 512,
  }));
  assert.equal(signingFailure.calls.includes("createPending"), false);

  const objectMissing = createAttachmentHarness({ missingObject: true });
  await assert.rejects(objectMissing.service.complete("project-1", "task-1", "attachment-1", "author-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
  assert.equal(objectMissing.calls.includes("markAvailable"), false);

  const deleteFailure = createAttachmentHarness({ deleteFails: true });
  deleteFailure.attachment.status = "AVAILABLE";
  await assert.rejects(deleteFailure.service.delete("project-1", "task-1", "attachment-1", "author-1"));
  assert.equal(deleteFailure.calls.includes("deleteMetadata"), false);
});

test("downloads are signed only for available attachments and deletes enforce owner permissions", async () => {
  const harness = createAttachmentHarness();
  harness.attachment.status = "AVAILABLE";
  const download = await harness.service.createDownloadUrl("project-1", "task-1", "attachment-1", "member-1");
  assert.equal(download.downloadUrl, "https://storage.test/download");
  assert.ok(harness.calls.includes("createDownloadUrl"));

  harness.attachment.uploadedById = "author-1";
  await assert.rejects(harness.service.delete("project-1", "task-1", "attachment-1", "outsider-1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
  await harness.service.delete("project-1", "task-1", "attachment-1", "author-1");
  assert.ok(harness.calls.includes("deleteObject"));
  assert.ok(harness.calls.includes("deleteMetadata"));
});

test("comment and attachment payload validators reject empty or oversized metadata", () => {
  assert.equal(commentBodySchema.safeParse({ body: "  " }).success, false);
  assert.equal(commentBodySchema.safeParse({ body: "Valid comment" }).success, true);
  assert.equal(createAttachmentSchema.safeParse({ fileName: "doc.pdf", contentType: "application/pdf", sizeBytes: 50 }).success, true);
  assert.equal(createAttachmentSchema.safeParse({ fileName: "doc.pdf", contentType: "application/pdf", sizeBytes: -1 }).success, false);
});
