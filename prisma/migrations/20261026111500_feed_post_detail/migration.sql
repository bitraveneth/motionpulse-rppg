-- Optional summary of motion, spectrum, and trust for a public post.
ALTER TABLE "FeedPost" ADD COLUMN "detail" JSONB;
