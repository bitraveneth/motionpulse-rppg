-- Hide a public feed post, or keep the post and hide only its video.
ALTER TABLE "FeedPost" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeedPost" ADD COLUMN "videoHidden" BOOLEAN NOT NULL DEFAULT false;
