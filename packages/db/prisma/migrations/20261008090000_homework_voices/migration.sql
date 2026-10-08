-- Voice notes handed in as homework through the bot (speaking tasks).
-- CreateTable
CREATE TABLE "homework_voices" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_voices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_voices_submissionId_idx" ON "homework_voices"("submissionId");

-- AddForeignKey
ALTER TABLE "homework_voices" ADD CONSTRAINT "homework_voices_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
