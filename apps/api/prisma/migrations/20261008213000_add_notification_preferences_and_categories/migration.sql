-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SYSTEM';

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailOnContribution" BOOLEAN NOT NULL DEFAULT true,
    "inAppOnContribution" BOOLEAN NOT NULL DEFAULT true,
    "pushOnContribution" BOOLEAN NOT NULL DEFAULT true,
    "emailOnPayout" BOOLEAN NOT NULL DEFAULT true,
    "inAppOnPayout" BOOLEAN NOT NULL DEFAULT true,
    "pushOnPayout" BOOLEAN NOT NULL DEFAULT true,
    "emailOnSecurityAlert" BOOLEAN NOT NULL DEFAULT true,
    "inAppOnSecurityAlert" BOOLEAN NOT NULL DEFAULT true,
    "pushOnSecurityAlert" BOOLEAN NOT NULL DEFAULT true,
    "emailOnProductUpdates" BOOLEAN NOT NULL DEFAULT false,
    "emailOnCreatorTips" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
