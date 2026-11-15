-- Face stills on dataset subjects, and the feed card that publishes them.
ALTER TABLE "LabSubject" ADD COLUMN "thumb" TEXT;

ALTER TABLE "FeedPost" ADD COLUMN "labSubjectId" TEXT;
ALTER TABLE "FeedPost" ADD COLUMN "datasetName" TEXT;
ALTER TABLE "FeedPost" ADD COLUMN "referenceBpm" DOUBLE PRECISION;

CREATE UNIQUE INDEX "FeedPost_labSubjectId_key" ON "FeedPost"("labSubjectId");
