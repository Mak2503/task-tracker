-- DropIndex
DROP INDEX "tasks_project_id_status_created_at_idx";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "tasks_project_id_archived_at_status_created_at_idx" ON "tasks"("project_id", "archived_at", "status", "created_at");
