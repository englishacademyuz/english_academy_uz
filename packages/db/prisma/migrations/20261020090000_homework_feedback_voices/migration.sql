-- The teacher's spoken feedback on a homework submission, kept on Telegram.
-- CreateTable
CREATE TABLE "homework_feedback_voices" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_feedback_voices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_feedback_voices_submissionId_key" ON "homework_feedback_voices"("submissionId");

-- AddForeignKey
ALTER TABLE "homework_feedback_voices" ADD CONSTRAINT "homework_feedback_voices_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
