-- AlterTable
ALTER TABLE "assessment_categories" ADD COLUMN     "maxScore" INTEGER NOT NULL DEFAULT 100;

-- CreateIndex
CREATE UNIQUE INDEX "assessments_groupId_categoryId_date_title_key" ON "assessments"("groupId", "categoryId", "date", "title");
