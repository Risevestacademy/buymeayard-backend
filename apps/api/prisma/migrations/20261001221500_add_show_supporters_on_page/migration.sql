-- Add showSupportersOnPage to creator_profiles table
ALTER TABLE "creator_profiles" ADD COLUMN "showSupportersOnPage" BOOLEAN NOT NULL DEFAULT true;
