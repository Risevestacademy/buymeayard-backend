-- DropForeignKey
ALTER TABLE "supports" DROP CONSTRAINT "supports_supporterId_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_supporterId_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_creatorId_fkey";

-- DropIndex
DROP INDEX "supports_supporterId_idx";

-- AlterTable
ALTER TABLE "supports" DROP COLUMN "supporterId";

-- DropTable
DROP TABLE "follows";

