-- Add thumbnail fields to materials table
ALTER TABLE "materials" ADD COLUMN "thumbnailSmallUrl" TEXT;
ALTER TABLE "materials" ADD COLUMN "thumbnailLargeUrl" TEXT;

-- Add thankYouMessage and isPublished to creator_profiles table
ALTER TABLE "creator_profiles" ADD COLUMN "thankYouMessage" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
