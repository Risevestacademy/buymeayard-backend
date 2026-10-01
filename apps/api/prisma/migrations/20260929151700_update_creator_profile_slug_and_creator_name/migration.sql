-- AlterTable: Add columns as nullable first
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "creatorName" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill slug from existing username or id if rows exist
UPDATE "creator_profiles"
SET "slug" = COALESCE("username", "personalizedLink", "id")
WHERE "slug" IS NULL;

-- AlterTable: Enforce NOT NULL on slug
ALTER TABLE "creator_profiles" ALTER COLUMN "slug" SET NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "creator_profiles_personalizedLink_idx";
DROP INDEX IF EXISTS "creator_profiles_personalizedLink_key";
DROP INDEX IF EXISTS "creator_profiles_username_idx";
DROP INDEX IF EXISTS "creator_profiles_username_key";

-- DropColumn
ALTER TABLE "creator_profiles" DROP COLUMN IF EXISTS "personalizedLink";
ALTER TABLE "creator_profiles" DROP COLUMN IF EXISTS "username";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "creator_profiles_slug_key" ON "creator_profiles"("slug");
CREATE INDEX IF NOT EXISTS "creator_profiles_slug_idx" ON "creator_profiles"("slug");
