-- AlterTable
ALTER TABLE "creator_reports" ADD COLUMN "evidenceLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "evidenceFileUrl" TEXT;
