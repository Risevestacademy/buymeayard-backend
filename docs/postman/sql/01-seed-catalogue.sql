-- Platform materials catalogue.
-- No API endpoint creates catalogue materials yet, so seed them directly.
-- Safe to re-run: existing slugs are left unchanged.
--
-- docker exec -i buymeayard-postgres psql -U postgres -d buymeayard \
--   < docs/postman/sql/01-seed-catalogue.sql

INSERT INTO materials (id, name, slug, description, "thumbnailSmallUrl", "thumbnailLargeUrl", color, "defaultPrice", currency, status, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Ankara',  'ankara',  'Traditional African wax print fabric, widely worn at celebrations and everyday occasions.', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048027/ankara_1_aprayy.png', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048029/ankara_vafdfc.png', '#7F3516', 100000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Adire',   'adire',   'Hand-crafted indigo-dyed fabric with rich Yoruba heritage and bold resist-dye patterns.',    'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/adire_jhpw59.png',    'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/adire_jhpw59.png',    '#4A2E8A', 100000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Ochafu',  'ochafu',  'Classic traditional woven textile fabric from eastern Nigeria, used for ceremonies and royalty.', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/ochafu_1_zv9ayh.png', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048031/ochafu_jpe0sw.png', '#54230E', 100000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Aso-Oke', 'aso-oke', 'Hand-woven prestige cloth from the Yoruba people of Nigeria, synonymous with celebration.', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/aso-oke_1_vdvwnw.png', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/aso-oke_qtypsn.png', '#AB491F', 100000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Akwete',  'akwete',  'Distinctive hand-woven textile from Akwete, Abia State — known for its bold geometric designs.', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-small_dsy242.png', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-big_jv3bj3.png', '#676670', 100000, 'NGN', 'ACTIVE', now(), now()),
  (gen_random_uuid(), 'Lace',    'lace',    'Intricate and elegant luxury lace fabric, a staple for Nigerian celebrations and ceremonies.', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/lace_1_cruzn4.png', 'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/lace_vxlyec.png', '#CAA8F5', 100000, 'NGN', 'ACTIVE', now(), now())
ON CONFLICT (slug) DO UPDATE SET
  "thumbnailSmallUrl" = EXCLUDED."thumbnailSmallUrl",
  "thumbnailLargeUrl" = EXCLUDED."thumbnailLargeUrl",
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  "updatedAt" = now();

SELECT slug, name, "defaultPrice", status FROM materials ORDER BY slug;
