-- Extra heart rates for the research questions. Null on older rows.
ALTER TABLE "LabSubject" ADD COLUMN "plainBpm" DOUBLE PRECISION;
ALTER TABLE "LabSubject" ADD COLUMN "weightedBpm" DOUBLE PRECISION;
