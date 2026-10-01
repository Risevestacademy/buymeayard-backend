-- Platform materials catalogue.
-- No API endpoint creates catalogue materials yet, so seed them directly.
-- Safe to re-run: existing slugs are left unchanged.
--
-- docker exec -i buymeayard-postgres psql -U postgres -d buymeayard \
--   < docs/postman/sql/01-seed-catalogue.sql

INSERT INTO materials (id, name, slug, description, "defaultPrice", currency, status, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Ankara',  'ankara',  'Bold wax-print cotton',          500000,  'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Lace',    'lace',    'Premium lace fabric',            1500000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Aso-oke', 'aso-oke', 'Hand-woven Yoruba cloth',        2500000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Adire',   'adire',   'Indigo tie-and-dye cloth',       300000,  'NGN', 'ACTIVE', now(), now())
ON CONFLICT (slug) DO NOTHING;

SELECT slug, name, "defaultPrice", status FROM materials ORDER BY slug;
