-- Conflict at the time of the scan, so RQ1 can compare it with a later label.
ALTER TABLE "Clip" ADD COLUMN "conflictScore" DOUBLE PRECISION;
