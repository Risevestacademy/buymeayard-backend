-- Test fixtures for one onboarded creator. Fills the gaps that have no API
-- endpoint yet: the creator's yard menu, a payout method and posts.
--
-- Pass the creator's username (the Postman collection variable
-- `creatorUsername`, printed in the Postman console after onboarding):
--
-- docker exec -i buymeayard-postgres psql -U postgres -d buymeayard \
--   -v creator=creator_abc123 < docs/postman/sql/02-seed-creator-fixtures.sql
--
-- Safe to re-run for the same creator. Requires 01-seed-catalogue.sql first.

\set ON_ERROR_STOP on

-- Fail loudly if the username is wrong, instead of inserting nothing.
SELECT 1 / (SELECT count(*) FROM creator_profiles WHERE username = :'creator')::int AS creator_exists;

-- 1. Yard menu. Prices are in kobo (500000 = NGN 5,000).
--    Adire is INACTIVE on purpose: supports that include it must be rejected.
INSERT INTO creator_materials (id, "creatorId", "materialId", price, currency, "displayName", description, status, "createdAt", "updatedAt")
SELECT gen_random_uuid(), cp.id, m.id, v.price, 'NGN', v.display_name, v.description, v.status, now(), now()
FROM creator_profiles cp
CROSS JOIN (VALUES
  ('ankara',  500000,  'Ankara (1 yard)',  'Support with a yard of Ankara', 'ACTIVE'),
  ('lace',    1500000, 'Lace (1 yard)',    'Support with a yard of Lace',   'ACTIVE'),
  ('aso-oke', 2500000, 'Aso-oke (1 yard)', 'Support with a yard of Aso-oke','ACTIVE'),
  ('adire',   300000,  'Adire (1 yard)',   'Currently unavailable',         'INACTIVE')
) AS v(slug, price, display_name, description, status)
JOIN materials m ON m.slug = v.slug
WHERE cp.username = :'creator'
ON CONFLICT ("creatorId", "materialId") DO UPDATE
  SET price = EXCLUDED.price, status = EXCLUDED.status, "updatedAt" = now();

-- 2. Default payout method (required before a payout can be requested).
INSERT INTO payout_methods (id, "creatorId", type, provider, "accountIdentifier", "accountName", "bankName", status, "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), cp.id, 'BANK_ACCOUNT', 'PAYSTACK', '0123456789', 'Test Creator', 'Test Bank', 'ACTIVE', true, now(), now()
FROM creator_profiles cp
WHERE cp.username = :'creator'
  AND NOT EXISTS (SELECT 1 FROM payout_methods pm WHERE pm."creatorId" = cp.id);

-- 3. Posts: one public, one exclusive (masked for non-entitled viewers),
--    one draft (must never appear in the public list).
INSERT INTO posts (id, "creatorId", title, body, visibility, status, "publishedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), cp.id, v.title, v.body, v.visibility, v.status,
       CASE WHEN v.status = 'PUBLISHED' THEN now() - v.age ELSE NULL END, now(), now()
FROM creator_profiles cp
CROSS JOIN (VALUES
  ('Welcome to my page',   'Thanks for stopping by!',                 'PUBLIC',    'PUBLISHED', interval '2 days'),
  ('Behind the seams',     'Exclusive sketches for my supporters.',   'EXCLUSIVE', 'PUBLISHED', interval '1 day'),
  ('Unfinished draft',     'This should not be visible to anyone.',   'PUBLIC',    'DRAFT',     interval '0')
) AS v(title, body, visibility, status, age)
WHERE cp.username = :'creator'
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p."creatorId" = cp.id AND p.title = v.title);

-- Summary
SELECT cm.id AS creator_material_id, m.slug, cm.price, cm.status
FROM creator_materials cm
JOIN materials m ON m.id = cm."materialId"
JOIN creator_profiles cp ON cp.id = cm."creatorId"
WHERE cp.username = :'creator'
ORDER BY cm.price;
