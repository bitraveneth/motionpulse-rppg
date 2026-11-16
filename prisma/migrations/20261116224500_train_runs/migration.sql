-- PhysNet training history: numbers, names, and the checkpoint path. No video.
CREATE TABLE "TrainRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'PhysNet',
    "folder" TEXT NOT NULL,
    "epochs" INTEGER NOT NULL,
    "people" INTEGER NOT NULL,
    "windowCount" INTEGER NOT NULL DEFAULT 0,
    "finalLoss" DOUBLE PRECISION,
    "bestLoss" DOUBLE PRECISION,
    "checkpoint" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "history" JSONB NOT NULL,

    CONSTRAINT "TrainRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainRun_startedAt_idx" ON "TrainRun"("startedAt");

CREATE TABLE "TrainPerson" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "windows" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrainPerson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainPerson_runId_idx" ON "TrainPerson"("runId");

ALTER TABLE "TrainPerson" ADD CONSTRAINT "TrainPerson_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TrainRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
