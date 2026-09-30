-- When a student's Telegram chats were told they missed a lesson.
ALTER TABLE "attendances" ADD COLUMN "absenceNotifiedAt" TIMESTAMP(3);
