-- AlterTable
ALTER TABLE "assessment_categories" ADD COLUMN     "pointsWorth" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "point_transactions" ADD COLUMN     "assessmentResultId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_assessmentResultId_key" ON "point_transactions"("assessmentResultId");

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_assessmentResultId_fkey" FOREIGN KEY ("assessmentResultId") REFERENCES "assessment_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
