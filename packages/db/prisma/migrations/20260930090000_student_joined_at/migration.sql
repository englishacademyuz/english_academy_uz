-- Each student is billed from the day they joined, not from their group's start.
ALTER TABLE "students" ADD COLUMN "joinedAt" TIMESTAMP(3);
ALTER TABLE "students" ADD COLUMN "paymentRemindedAt" TIMESTAMP(3);

-- Existing students: the day they first joined a group, else the (Tashkent) day they were created.
UPDATE "students" s SET "joinedAt" = COALESCE(
  (SELECT MIN(e."startDate") FROM "enrollments" e WHERE e."studentId" = s."id"),
  date_trunc('day', s."createdAt" + INTERVAL '5 hours')
);

ALTER TABLE "students" ALTER COLUMN "joinedAt" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "joinedAt" SET DEFAULT CURRENT_TIMESTAMP;
