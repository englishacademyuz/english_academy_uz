-- A homework picture's deadline is now a moment (day and time), not a calendar day.
-- Deadlines set so far were days, stored as UTC midnight; each becomes 23:59 of that
-- day in Tashkent (UTC+5), so nothing falls due earlier than it did.
UPDATE "homework_images" SET "dueDate" = "dueDate" + interval '18 hours 59 minutes' WHERE "dueDate" IS NOT NULL;
