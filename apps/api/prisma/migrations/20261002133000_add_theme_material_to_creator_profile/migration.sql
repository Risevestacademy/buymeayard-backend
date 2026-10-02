-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN "themeMaterialId" TEXT;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_themeMaterialId_fkey" FOREIGN KEY ("themeMaterialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
