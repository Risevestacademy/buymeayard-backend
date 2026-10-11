/*
  Warnings:

  - You are about to alter the column `quantity` on the `support_items` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE "support_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "supports" ADD COLUMN     "guestName" TEXT,
ALTER COLUMN "supporterId" DROP NOT NULL;
