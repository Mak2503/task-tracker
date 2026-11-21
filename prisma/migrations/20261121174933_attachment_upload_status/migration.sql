/*
  Warnings:

  - Added the required column `upload_expires_at` to the `attachments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

-- DropIndex
DROP INDEX "attachments_task_id_created_at_idx";

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "upload_expires_at" TIMESTAMPTZ(3) NOT NULL;

-- CreateIndex
CREATE INDEX "attachments_task_id_status_created_at_idx" ON "attachments"("task_id", "status", "created_at");
