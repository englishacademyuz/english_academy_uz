-- AlterTable: every level gets its own color. Existing levels are backfilled
-- from the same palette the server picks from, in creation order.
ALTER TABLE "levels" ADD COLUMN "color" TEXT;

WITH palette AS (
  SELECT color, ordinality - 1 AS idx
  FROM unnest(ARRAY[
    '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6',
    '#14b8a6', '#d946ef', '#f97316', '#84cc16', '#06b6d4', '#ec4899'
  ]) WITH ORDINALITY AS t(color, ordinality)
),
ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY id) - 1) AS idx FROM "levels"
)
UPDATE "levels" l
SET "color" = p.color
FROM ordered o
JOIN palette p ON p.idx = o.idx % 12
WHERE l.id = o.id;

ALTER TABLE "levels" ALTER COLUMN "color" SET NOT NULL;

-- AlterTable
ALTER TABLE "groups" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "lesson_reschedules" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "originalDate" TIMESTAMP(3) NOT NULL,
    "newDate" TIMESTAMP(3) NOT NULL,
    "newTime" TEXT NOT NULL,
    "reason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_reschedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_reschedules_newDate_idx" ON "lesson_reschedules"("newDate");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_reschedules_groupId_originalDate_key" ON "lesson_reschedules"("groupId", "originalDate");

-- AddForeignKey
ALTER TABLE "lesson_reschedules" ADD CONSTRAINT "lesson_reschedules_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
