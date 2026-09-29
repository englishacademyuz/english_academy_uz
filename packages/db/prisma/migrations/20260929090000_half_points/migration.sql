-- Rating points move in half-point steps (7.5), so they can no longer be integers.
-- Widening INTEGER to DOUBLE PRECISION keeps every existing value as is.
ALTER TABLE "point_transactions" ALTER COLUMN "points" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "quiz_attempts" ALTER COLUMN "points" SET DATA TYPE DOUBLE PRECISION;
