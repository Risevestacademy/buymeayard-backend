-- AlterTable: Add creatorId to materials as nullable foreign key
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "creatorId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "materials_creatorId_idx" ON "materials"("creatorId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'materials_creatorId_fkey'
  ) THEN
    ALTER TABLE "materials" ADD CONSTRAINT "materials_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
