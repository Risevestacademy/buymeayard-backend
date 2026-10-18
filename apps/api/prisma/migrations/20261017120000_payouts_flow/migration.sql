-- DropIndex
DROP INDEX "payouts_creatorId_idx";

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "payoutId" TEXT,
ALTER COLUMN "paymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumberLast4" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "delayNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "netAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutMethodId" TEXT,
ADD COLUMN     "providerTransferCode" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "payout_methods" ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "recipientCode" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payoutId" TEXT,
    "supportId" TEXT,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");

-- CreateIndex
CREATE INDEX "support_tickets_payoutId_idx" ON "support_tickets"("payoutId");

-- CreateIndex
CREATE INDEX "support_tickets_supportId_idx" ON "support_tickets"("supportId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts"("reference");

-- CreateIndex
CREATE INDEX "payouts_creatorId_requestedAt_idx" ON "payouts"("creatorId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_creatorId_idempotencyKey_key" ON "payouts"("creatorId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "payout_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "supports"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing payouts had no fee, so the full amount was sent
UPDATE "payouts" SET "netAmount" = "amount" WHERE "netAmount" = 0;

-- Numbering for creator-facing payout references (PYT-YYYYMMDD-0041)
CREATE SEQUENCE IF NOT EXISTS "payout_reference_seq";
