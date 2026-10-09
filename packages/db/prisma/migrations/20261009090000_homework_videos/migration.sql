-- Videos handed in as homework through the bot (round video messages and regular videos).
-- CreateTable
CREATE TABLE "homework_videos" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT NOT NULL,
    "round" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_videos_submissionId_idx" ON "homework_videos"("submissionId");

-- AddForeignKey
ALTER TABLE "homework_videos" ADD CONSTRAINT "homework_videos_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
