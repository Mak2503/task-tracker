import {
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

export type StoredObjectMetadata = {
  sizeBytes?: number;
  contentType?: string;
};

export type PresignedUpload = { url: string; fields: Record<string, string> };

export interface ObjectStorage {
  createUploadUrl(key: string, contentType: string, sizeBytes: number, expiresInSeconds: number): Promise<PresignedUpload>;
  createDownloadUrl(key: string, contentType: string, fileName: string, expiresInSeconds: number): Promise<string>;
  head(key: string): Promise<StoredObjectMetadata>;
  delete(key: string): Promise<void>;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client = new S3Client({
    region: env.OBJECT_STORAGE_REGION,
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
    },
  });

  async createUploadUrl(key: string, contentType: string, sizeBytes: number, expiresInSeconds: number): Promise<PresignedUpload> {
    const post = await createPresignedPost(this.client, {
      Bucket: env.OBJECT_STORAGE_BUCKET,
      Key: key,
      Expires: expiresInSeconds,
      Fields: { "Content-Type": contentType },
      Conditions: [
        ["content-length-range", sizeBytes, sizeBytes],
        ["eq", "$Content-Type", contentType],
      ],
    });
    return { url: post.url, fields: post.fields };
  }

  async createDownloadUrl(key: string, contentType: string, fileName: string, expiresInSeconds: number): Promise<string> {
    const safeFileName = fileName.replace(/[\r\n"/\\]/g, "_");
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: env.OBJECT_STORAGE_BUCKET,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
    }), { expiresIn: expiresInSeconds });
  }

  async head(key: string): Promise<StoredObjectMetadata> {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, Key: key }));
    return { sizeBytes: result.ContentLength, contentType: result.ContentType };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, Key: key }));
  }
}
