-- Each homework picture is a task of its own: an optional title and deadline.
-- AlterTable
ALTER TABLE "homework_images" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "title" TEXT;
