-- CreateTable
CREATE TABLE "creator_reports" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "reporterEmail" TEXT,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_reports_creatorId_idx" ON "creator_reports"("creatorId");

-- CreateIndex
CREATE INDEX "creator_reports_status_idx" ON "creator_reports"("status");

-- AddForeignKey
ALTER TABLE "creator_reports" ADD CONSTRAINT "creator_reports_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
