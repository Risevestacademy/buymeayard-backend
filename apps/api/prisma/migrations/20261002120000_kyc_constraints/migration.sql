-- KYC data constraints.
--
-- 1. Audited demotion: contributions and payouts are gated on ACTIVE, so a
--    creator that is ACTIVE without VERIFIED KYC (only possible through
--    manual data edits) must not stay publicly active. Every demoted row is
--    recorded in audit_logs and the total is reported, so nothing changes
--    silently.
-- 2. CHECK constraints so invalid status values cannot be written by any
--    code path or manual update, and so Postgres itself enforces the money
--    invariant ACTIVE => VERIFIED. If existing data violates a value list the
--    migration fails loudly instead of rewriting data.

-- 1. Audited demotion -------------------------------------------------------
WITH demoted AS (
  UPDATE "creator_profiles"
  SET "status" = 'PROFILE_CREATED', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "status" = 'ACTIVE' AND "kycStatus" <> 'VERIFIED'
  RETURNING "id", "kycStatus"
)
INSERT INTO "audit_logs" (
  "id", "actorId", "action", "resourceType", "resourceId",
  "previousState", "newState", "metadata", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  NULL,
  'CREATOR_DEMOTED_BY_MIGRATION',
  'CREATOR_PROFILE',
  d."id",
  jsonb_build_object('status', 'ACTIVE', 'kycStatus', d."kycStatus"),
  jsonb_build_object('status', 'PROFILE_CREATED', 'kycStatus', d."kycStatus"),
  jsonb_build_object(
    'migration', '20261002120000_kyc_constraints',
    'reason', 'ACTIVE requires kycStatus VERIFIED'
  ),
  CURRENT_TIMESTAMP
FROM demoted d;

DO $$
DECLARE demoted_count integer;
BEGIN
  SELECT count(*) INTO demoted_count
  FROM "audit_logs"
  WHERE "action" = 'CREATOR_DEMOTED_BY_MIGRATION'
    AND "metadata"->>'migration' = '20261002120000_kyc_constraints';
  RAISE NOTICE 'kyc_constraints: % creator(s) demoted from ACTIVE (audit_logs action CREATOR_DEMOTED_BY_MIGRATION)', demoted_count;
END $$;

-- 2. Constraints -------------------------------------------------------------
ALTER TABLE "kyc_submissions"
  ADD CONSTRAINT "kyc_submissions_status_check" CHECK ("status" IN (
    'CREATED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED',
    'RESUBMISSION_REQUIRED', 'ABANDONED', 'EXPIRED', 'KYC_EXPIRED', 'CANCELLED'
  ));

ALTER TABLE "creator_profiles"
  ADD CONSTRAINT "creator_profiles_kyc_status_check" CHECK ("kycStatus" IN (
    'NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_REVIEW', 'EXPIRED'
  ));

ALTER TABLE "creator_profiles"
  ADD CONSTRAINT "creator_profiles_status_check" CHECK ("status" IN (
    'REGISTERED', 'PROFILE_CREATED', 'KYC_PENDING', 'VERIFIED', 'ACTIVE',
    'SUSPENDED', 'BANNED', 'DEACTIVATED'
  ));

-- The money invariant: only verified creators can be publicly active.
ALTER TABLE "creator_profiles"
  ADD CONSTRAINT "creator_profiles_active_requires_verified"
  CHECK ("status" <> 'ACTIVE' OR "kycStatus" = 'VERIFIED');
