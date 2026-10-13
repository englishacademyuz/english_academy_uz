-- Homework is handed in task by task: each picture task, and the written homework, gets its
-- own submission. Submissions so far were for the homework as a whole; they become the written
-- homework's (task 'written').
ALTER TABLE "homework_submissions" ADD COLUMN "homeworkImageId" TEXT,
ADD COLUMN "task" TEXT NOT NULL DEFAULT 'written';

DROP INDEX "homework_submissions_homeworkId_studentId_key";
CREATE UNIQUE INDEX "homework_submissions_homeworkId_studentId_task_key" ON "homework_submissions"("homeworkId", "studentId", "task");

ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homeworkImageId_fkey" FOREIGN KEY ("homeworkImageId") REFERENCES "homework_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The written homework's deadline is now a moment (day and time), like a picture task's.
-- Deadlines set so far were days, stored as UTC midnight; each becomes 23:59 of that day in
-- Tashkent (UTC+5), so nothing falls due earlier than it did.
UPDATE "homeworks" SET "dueDate" = "dueDate" + interval '18 hours 59 minutes' WHERE "dueDate" IS NOT NULL;

-- Where a student's next voice note or video sent to the bot goes.
ALTER TABLE "students" ADD COLUMN "botHomeworkTask" TEXT,
ADD COLUMN "botHomeworkTaskAt" TIMESTAMP(3);
