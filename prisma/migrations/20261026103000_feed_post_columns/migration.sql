-- The live table was created with an older column set (settledHeartRate).
-- Keep those posts and match the columns the feed reads.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'FeedPost'
      AND column_name = 'settledHeartRate'
  ) THEN
    CREATE TABLE "FeedPost_next" (
      "id" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "nickname" TEXT,
      "bpm" DOUBLE PRECISION NOT NULL,
      "conflictScore" DOUBLE PRECISION NOT NULL,
      "riskLevel" TEXT NOT NULL,
      "respiratoryRate" DOUBLE PRECISION,
      "durationSec" DOUBLE PRECISION NOT NULL,
      "source" TEXT NOT NULL,
      "thumb" TEXT,
      "videoMime" TEXT,
      "videoBytes" BYTEA,
      "hasVideo" BOOLEAN NOT NULL DEFAULT false,
      "userId" TEXT,
      CONSTRAINT "FeedPost_next_pkey" PRIMARY KEY ("id")
    );

    INSERT INTO "FeedPost_next" (
      "id", "createdAt", "nickname", "bpm", "conflictScore", "riskLevel",
      "respiratoryRate", "durationSec", "source", "thumb", "hasVideo"
    )
    SELECT
      "id",
      "createdAt",
      "nickname",
      COALESCE("settledHeartRate", 0),
      0,
      COALESCE(NULLIF("risk", ''), 'low'),
      "respiratoryRate",
      10,
      'webcam',
      "thumb",
      false
    FROM "FeedPost";

    DROP TABLE "FeedPost";
    ALTER TABLE "FeedPost_next" RENAME TO "FeedPost";
    ALTER TABLE "FeedPost" RENAME CONSTRAINT "FeedPost_next_pkey" TO "FeedPost_pkey";
    CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt");
  END IF;
END $$;
