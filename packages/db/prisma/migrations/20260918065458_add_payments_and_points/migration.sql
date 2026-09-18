-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DEBT', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "PointActivityType" AS ENUM ('HOMEWORK', 'PARTICIPATION', 'QUIZ', 'ASSESSMENT', 'ATTENDANCE', 'OTHER');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DEBT',
    "paidAt" TIMESTAMP(3),
    "recordedByUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "activityType" "PointActivityType" NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_studentId_year_month_key" ON "payments"("studentId", "year", "month");

-- CreateIndex
CREATE INDEX "point_transactions_studentId_idx" ON "point_transactions"("studentId");

-- CreateIndex
CREATE INDEX "point_transactions_groupId_idx" ON "point_transactions"("groupId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
