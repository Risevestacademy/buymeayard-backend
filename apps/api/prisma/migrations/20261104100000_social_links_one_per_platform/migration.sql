-- Social links now use a fixed platform list where X replaces Twitter.
UPDATE "creator_social_links" SET "platform" = 'x' WHERE "platform" = 'twitter';

-- One link per platform per creator: keep the most recently updated duplicate.
DELETE FROM "creator_social_links" a
USING "creator_social_links" b
WHERE a."creatorId" = b."creatorId"
  AND a."platform" = b."platform"
  AND (a."updatedAt", a."id") < (b."updatedAt", b."id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_social_links_creatorId_platform_key" ON "creator_social_links"("creatorId", "platform");
