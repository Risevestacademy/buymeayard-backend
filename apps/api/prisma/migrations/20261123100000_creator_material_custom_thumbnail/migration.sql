-- The creator's own banner image for a material; null means use the system thumbnail
ALTER TABLE "creator_materials" ADD COLUMN "customThumbnailUrl" TEXT;
