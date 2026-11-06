-- Each Group's points winner(s) for a finished calendar month (MonthlyChampion).
-- CreateTable
CREATE TABLE "monthly_champions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announcedAt" TIMESTAMP(3),

    CONSTRAINT "monthly_champions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_champions_groupId_year_month_studentId_key" ON "monthly_champions"("groupId", "year", "month", "studentId");

-- CreateIndex
CREATE INDEX "monthly_champions_studentId_idx" ON "monthly_champions"("studentId");

-- AddForeignKey
ALTER TABLE "monthly_champions" ADD CONSTRAINT "monthly_champions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_champions" ADD CONSTRAINT "monthly_champions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
