-- One Telegram bot, student view only: parents are removed and instead link
-- their own chat to the student with the student's (reusable) code.
-- Existing Telegram links are carried over before anything is dropped.

-- CreateTable
CREATE TABLE "telegram_links" (
    "chatId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("chatId")
);

-- CreateIndex
CREATE INDEX "telegram_links_studentId_idx" ON "telegram_links"("studentId");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over: chats already linked as a student keep their student.
INSERT INTO "telegram_links" ("chatId", "studentId")
SELECT u."telegramChatId", s."id"
FROM "users" u
JOIN "students" s ON s."userId" = u."id"
WHERE u."telegramChatId" IS NOT NULL;

-- Carry over: chats linked as a parent now view their earliest-linked active child.
INSERT INTO "telegram_links" ("chatId", "studentId")
SELECT DISTINCT ON (u."telegramChatId") u."telegramChatId", l."studentId"
FROM "users" u
JOIN "parents" p ON p."userId" = u."id"
JOIN "parent_student_links" l ON l."parentId" = p."id" AND l."unlinkedAt" IS NULL
WHERE u."telegramChatId" IS NOT NULL
ORDER BY u."telegramChatId", l."linkedAt"
ON CONFLICT ("chatId") DO NOTHING;

-- Linking codes now always belong to a student; parent codes are discarded.
ALTER TABLE "linking_codes" ADD COLUMN "studentId" TEXT;
UPDATE "linking_codes" SET "studentId" = "targetId" WHERE "targetType" = 'STUDENT';
DELETE FROM "linking_codes"
WHERE "studentId" IS NULL OR "studentId" NOT IN (SELECT "id" FROM "students");
ALTER TABLE "linking_codes" ALTER COLUMN "studentId" SET NOT NULL,
DROP COLUMN "consumedAt",
DROP COLUMN "targetId",
DROP COLUMN "targetType";

-- CreateIndex
CREATE INDEX "linking_codes_studentId_idx" ON "linking_codes"("studentId");

-- AddForeignKey
ALTER TABLE "linking_codes" ADD CONSTRAINT "linking_codes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable
DROP TABLE "parent_student_links";

-- DropTable
DROP TABLE "parents";

-- Parent users have no profile left to point at.
DELETE FROM "users" WHERE "role" = 'PARENT';

-- DropEnum
DROP TYPE "LinkingTargetType";

-- DropIndex
DROP INDEX "users_telegramChatId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "telegramChatId";

-- AlterEnum
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
