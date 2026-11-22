-- Replace the isAnonymous flag with three visibility levels.
-- Old anonymous gifts become ANONYMOUS (hidden from the wall and the creator).
ALTER TABLE "supports" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
UPDATE "supports" SET "visibility" = 'ANONYMOUS' WHERE "isAnonymous" = true;
ALTER TABLE "supports" DROP COLUMN "isAnonymous";
