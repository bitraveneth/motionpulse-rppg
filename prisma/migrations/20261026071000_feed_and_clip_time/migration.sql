-- Each settled clip keeps its own time, not only the session time.
ALTER TABLE "Clip" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Public feed. Face video is optional and stored only when someone posts a clip.
CREATE TABLE "FeedPost" (
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

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt");
