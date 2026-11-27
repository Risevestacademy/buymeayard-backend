-- What the supporter is charged, when it is not NGN. The ledger stays in NGN.
ALTER TABLE "supports"
  ADD COLUMN "chargeCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "chargeAmount" INTEGER,
  ADD COLUMN "fxRate" DECIMAL(18,6);

ALTER TABLE "payments"
  ADD COLUMN "chargeCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "chargeAmount" INTEGER;
