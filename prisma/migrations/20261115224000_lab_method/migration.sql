-- Which pulse method produced a subject card.
ALTER TABLE "LabSubject" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'CHROM';
ALTER TABLE "FeedPost" ADD COLUMN "method" TEXT;
