-- An earlier FeedPost shape stored optional video bytes. That table is empty.
-- Replace it with metric rows only: no video column.
DROP TABLE IF EXISTS "FeedPost";

-- CreateTable
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nickname" TEXT,
    "settledHeartRate" DOUBLE PRECISION NOT NULL,
    "respiratoryRate" DOUBLE PRECISION,
    "signalLabel" TEXT,
    "risk" TEXT,
    "thumb" TEXT,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt");
