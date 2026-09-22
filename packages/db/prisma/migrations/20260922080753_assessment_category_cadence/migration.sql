-- CreateEnum
CREATE TYPE "AssessmentCategoryCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "assessment_categories" ADD COLUMN     "cadence" "AssessmentCategoryCadence" NOT NULL DEFAULT 'DAILY';
