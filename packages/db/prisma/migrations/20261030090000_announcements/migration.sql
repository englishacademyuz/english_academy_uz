-- News, events and organizational notices staff send to groups (Announcement), the groups each
-- went to, and the Telegram messages it was delivered as (so deleting it can take them back).
-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('NEWS', 'EVENT', 'ORGANIZATIONAL');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3),
    "amount" INTEGER,
    "imageFileId" TEXT,
    "imageFileUniqueId" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_groups" (
    "announcementId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "announcement_groups_pkey" PRIMARY KEY ("announcementId","groupId")
);

-- CreateTable
CREATE TABLE "announcement_messages" (
    "announcementId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,

    CONSTRAINT "announcement_messages_pkey" PRIMARY KEY ("chatId","messageId")
);

-- CreateIndex
CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");

-- CreateIndex
CREATE INDEX "announcement_groups_groupId_idx" ON "announcement_groups"("groupId");

-- CreateIndex
CREATE INDEX "announcement_messages_announcementId_idx" ON "announcement_messages"("announcementId");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_groups" ADD CONSTRAINT "announcement_groups_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_groups" ADD CONSTRAINT "announcement_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_messages" ADD CONSTRAINT "announcement_messages_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

