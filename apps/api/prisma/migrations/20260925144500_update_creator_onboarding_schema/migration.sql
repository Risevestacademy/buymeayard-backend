-- DropForeignKey
ALTER TABLE "creator_profiles" DROP CONSTRAINT "creator_profiles_categoryId_fkey";

-- DropIndex
DROP INDEX "creator_profiles_categoryId_idx";

-- AlterTable
ALTER TABLE "creator_profiles" DROP COLUMN "categoryId",
DROP COLUMN "coverUrl",
ADD COLUMN     "personalizedLink" TEXT;

-- DropTable
DROP TABLE "creator_categories";

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_personalizedLink_key" ON "creator_profiles"("personalizedLink");

-- CreateIndex
CREATE INDEX "creator_profiles_personalizedLink_idx" ON "creator_profiles"("personalizedLink");
