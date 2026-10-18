-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN IF NOT EXISTS "themeMaterialId" TEXT;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'creator_profiles_themeMaterialId_fkey'
    ) THEN
        ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_themeMaterialId_fkey" FOREIGN KEY ("themeMaterialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
