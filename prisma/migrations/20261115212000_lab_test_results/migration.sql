-- Dataset test history: numbers and the time, never the video.
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "clipCount" INTEGER NOT NULL DEFAULT 0,
    "faceCount" INTEGER NOT NULL DEFAULT 0,
    "paired" INTEGER NOT NULL DEFAULT 0,
    "mae" DOUBLE PRECISION,
    "rmse" DOUBLE PRECISION,
    "pearson" DOUBLE PRECISION,
    "snrMean" DOUBLE PRECISION,
    "snrDb" DOUBLE PRECISION,
    "bias" DOUBLE PRECISION,
    "loaLow" DOUBLE PRECISION,
    "loaHigh" DOUBLE PRECISION,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabTest_createdAt_idx" ON "LabTest"("createdAt");

CREATE TABLE "LabSubject" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT NOT NULL,
    "bpm" DOUBLE PRECISION NOT NULL,
    "referenceBpm" DOUBLE PRECISION,
    "snr" DOUBLE PRECISION,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "respiratoryRate" DOUBLE PRECISION,
    "breathsInClip" DOUBLE PRECISION,
    "risk" TEXT NOT NULL,
    "conflict" DOUBLE PRECISION NOT NULL,
    "windows" INTEGER NOT NULL,
    "frames" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,

    CONSTRAINT "LabSubject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabSubject_testId_idx" ON "LabSubject"("testId");

ALTER TABLE "LabSubject" ADD CONSTRAINT "LabSubject_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LabTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
