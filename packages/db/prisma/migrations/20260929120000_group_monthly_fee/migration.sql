-- The monthly course fee a group's payments default to; 0 = not set yet.
ALTER TABLE "groups" ADD COLUMN "monthlyFee" INTEGER NOT NULL DEFAULT 0;
