-- AlterTable
ALTER TABLE "creator_materials" ALTER COLUMN "price" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "ledger_entries" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "materials" ALTER COLUMN "defaultPrice" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "payouts" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "support_items" ALTER COLUMN "unitPrice" SET DATA TYPE BIGINT,
ALTER COLUMN "totalPrice" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "supports" ALTER COLUMN "subtotal" SET DATA TYPE BIGINT,
ALTER COLUMN "platformFee" SET DATA TYPE BIGINT,
ALTER COLUMN "creatorAmount" SET DATA TYPE BIGINT,
ALTER COLUMN "totalAmount" SET DATA TYPE BIGINT;
