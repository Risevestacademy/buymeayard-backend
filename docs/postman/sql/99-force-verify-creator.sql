-- FALLBACK ONLY. Marks a creator as KYC-verified and ACTIVE without going
-- through Didit or the signed webhook. Use this only when you cannot set
-- DIDIT_WEBHOOK_SECRET / DIDIT_WORKFLOW_ID locally. It skips the KYC state
-- machine: no submission, audit log or notification is written.
--
-- docker exec -i buymeayard-postgres psql -U postgres -d buymeayard \
--   -v creator=creator_abc123 < docs/postman/sql/99-force-verify-creator.sql

\set ON_ERROR_STOP on

UPDATE creator_profiles
SET "kycStatus" = 'VERIFIED',
    status = 'ACTIVE',
    "kycVerifiedAt" = now(),
    "kycBlockedAt" = NULL,
    "kycBlockedReason" = NULL,
    "updatedAt" = now()
WHERE slug = :'creator'
RETURNING id, slug, status, "kycStatus";
