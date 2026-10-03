-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN     "kycBlockedAt" TIMESTAMP(3),
ADD COLUMN     "kycBlockedReason" TEXT,
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kyc_submissions" ADD COLUMN     "claimedDetails" JSONB,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "decisionSummary" JSONB,
ADD COLUMN     "environment" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "providerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "workflowId" TEXT,
ALTER COLUMN "provider" SET DEFAULT 'DIDIT',
ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- Data cleanup: the previous stub KYC endpoint stored placeholder submissions
-- (provider 'DEFAULT_KYC') without any real verification. Close them out and
-- reset creators it had marked PENDING so they can start a real verification.
UPDATE "kyc_submissions"
SET "status" = 'CANCELLED', "completedAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'DEFAULT_KYC' AND "status" = 'PENDING';

UPDATE "creator_profiles"
SET "kycStatus" = 'NOT_SUBMITTED'
WHERE "kycStatus" = 'PENDING';

-- CreateTable
CREATE TABLE "kyc_events" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'DIDIT',
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerStatus" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_events_submissionId_idx" ON "kyc_events"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_events_provider_providerEventId_key" ON "kyc_events"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "kyc_submissions_creatorId_createdAt_idx" ON "kyc_submissions"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "kyc_submissions_status_idx" ON "kyc_submissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_submissions_provider_providerReference_key" ON "kyc_submissions"("provider", "providerReference");

-- AddForeignKey
ALTER TABLE "kyc_events" ADD CONSTRAINT "kyc_events_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "kyc_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
