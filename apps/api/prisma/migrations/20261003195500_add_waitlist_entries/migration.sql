-- CreateTable
CREATE TABLE IF NOT EXISTS "waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_email_key" ON "waitlist_entries"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "waitlist_entries_email_idx" ON "waitlist_entries"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "waitlist_entries_createdAt_idx" ON "waitlist_entries"("createdAt");
