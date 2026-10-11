-- DropIndex
DROP INDEX "supports_creatorId_idx";

-- CreateIndex
CREATE INDEX "supports_creatorId_createdAt_id_idx" ON "supports"("creatorId", "createdAt" DESC, "id" DESC);
