-- Siblings who share one phone, tied together by an admin.
-- CreateTable
CREATE TABLE "families" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "students" ADD COLUMN "familyId" TEXT;

-- CreateIndex
CREATE INDEX "students_familyId_idx" ON "students"("familyId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
