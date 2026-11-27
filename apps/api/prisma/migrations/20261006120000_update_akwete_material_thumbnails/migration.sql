-- Seed or update Akwete material with official images
INSERT INTO "materials" (
  "id",
  "name",
  "slug",
  "description",
  "thumbnailSmallUrl",
  "thumbnailLargeUrl",
  "imageUrl",
  "color",
  "defaultPrice",
  "currency",
  "status",
  "createdAt",
  "updatedAt"
)
VALUES (
  gen_random_uuid(),
  'Akwete',
  'akwete',
  'Distinctive hand-woven textile from Akwete, Abia State — known for its bold geometric designs.',
  'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-small_dsy242.png',
  'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-big_jv3bj3.png',
  'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-big_jv3bj3.png',
  '#676670',
  100000,
  'NGN',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT ("slug") DO UPDATE SET
  "thumbnailSmallUrl" = EXCLUDED."thumbnailSmallUrl",
  "thumbnailLargeUrl" = EXCLUDED."thumbnailLargeUrl",
  "imageUrl" = EXCLUDED."imageUrl",
  "description" = EXCLUDED."description",
  "color" = EXCLUDED."color",
  "updatedAt" = now();
