-- Pictures a teacher attaches to a lesson's homework, each with an optional caption.
-- CreateTable
CREATE TABLE "homework_images" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "homeworkId" TEXT,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_images_homeworkId_idx" ON "homework_images"("homeworkId");

-- AddForeignKey
ALTER TABLE "homework_images" ADD CONSTRAINT "homework_images_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_images" ADD CONSTRAINT "homework_images_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homeworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
