import { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

const prisma = new PrismaClient();

const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  account: {
    modelName: 'authAccount',
  },
  secret: process.env.BETTER_AUTH_SECRET || 'seed-secret',
  emailAndPassword: {
    enabled: true,
  },
});

const DEFAULT_ROLES = [
  'SUPPORTER',
  'CREATOR',
  'ADMIN',
  'SUPER_ADMIN',
  'MODERATOR',
  'FINANCE',
  'SUPPORT',
];

// Development-only defaults. Never valid in production.
const DEV_ADMIN_EMAIL = 'admin@buymeayard.com';
const DEV_ADMIN_PASSWORD = 'AdminPassword123!';

/**
 * Admin credentials come from ADMIN_EMAIL / ADMIN_PASSWORD. In production the
 * seed refuses to run without a strong, non-default password, so no
 * environment can end up with a publicly known admin login.
 */
function resolveAdminCredentials() {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.ADMIN_EMAIL || DEV_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (isProduction) {
    if (
      adminPassword.length < 12 ||
      adminPassword === DEV_ADMIN_PASSWORD
    ) {
      throw new Error(
        'Refusing to seed in production: set ADMIN_PASSWORD to a strong, non-default value (12+ characters).',
      );
    }
    return { adminEmail, adminPassword };
  }

  if (!adminPassword) {
    console.warn(
      `⚠️  Using the DEVELOPMENT admin login (${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}). Set ADMIN_PASSWORD to override. Never use this outside local development.`,
    );
  }
  return { adminEmail, adminPassword: adminPassword || DEV_ADMIN_PASSWORD };
}

async function main() {
  // Validate credentials before touching the database.
  const { adminEmail, adminPassword } = resolveAdminCredentials();
  console.log('🌱 Starting database seeding...');

  // 1. Seed Roles
  console.log('Seeding roles...');
  for (const roleName of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }
  console.log('✅ Roles seeded.');

  // 2. Seed Super Admin User

  let adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminUser) {
    console.log(`Creating super admin user (${adminEmail})...`);
    
    // We use Better Auth's native API to handle the password hashing and account creation
    const res = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: 'Super Admin',
      },
      asResponse: true,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to create admin user:', errorText);
      throw new Error('Admin creation failed');
    }

    adminUser = await prisma.user.findUnique({
      where: { email: adminEmail },
    });
    console.log('✅ Super admin user created.');
  } else {
    console.log('⚡ Super admin user already exists. Skipping creation.');
  }

  // 3. Attach SUPER_ADMIN and ADMIN roles to the user
  if (adminUser) {
    const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    const supporterRole = await prisma.role.findUnique({ where: { name: 'SUPPORTER' } });

    if (adminRole && superAdminRole) {
      // Upsert UserRole for ADMIN
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: adminUser.id,
            roleId: adminRole.id,
          },
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleId: adminRole.id,
        },
      });

      // Upsert UserRole for SUPER_ADMIN
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: adminUser.id,
            roleId: superAdminRole.id,
          },
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleId: superAdminRole.id,
        },
      });
      console.log('✅ Super Admin roles attached to user.');
    }

    // Every user is a supporter by default
    if (supporterRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: adminUser.id,
            roleId: supporterRole.id,
          },
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleId: supporterRole.id,
        },
      });
      console.log('✅ SUPPORTER role attached to admin user.');
    }
  }

  // 3. Seed Platform Materials with Universal Base Price (₦1,000 / 100,000 kobo)
  console.log('Seeding default platform materials...');
  const DEFAULT_MATERIALS = [
    {
      name: 'Ankara',
      slug: 'ankara',
      description:
        'Traditional African wax print fabric, widely worn at celebrations and everyday occasions.',
      thumbnailSmallUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048027/ankara_1_aprayy.png',
      thumbnailLargeUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048029/ankara_vafdfc.png',
      color: '#7F3516', // Primary/700 - rich terracotta earth
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Adire',
      slug: 'adire',
      description:
        'Hand-crafted indigo-dyed fabric with rich Yoruba heritage and bold resist-dye patterns.',
      thumbnailSmallUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/adire_jhpw59.png',
      thumbnailLargeUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/adire_jhpw59.png',
      color: '#4A2E8A', // Secondary - Amethyst/600 - deep indigo purple
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Ochafu',
      slug: 'ochafu',
      description:
        'Classic traditional woven textile fabric from eastern Nigeria, used for ceremonies and royalty.',
      thumbnailSmallUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/ochafu_1_zv9ayh.png',
      thumbnailLargeUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048031/ochafu_jpe0sw.png',
      color: '#54230E', // Primary/800 - deep royal umber
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Aso-Oke',
      slug: 'aso-oke',
      description:
        'Hand-woven prestige cloth from the Yoruba people of Nigeria, synonymous with celebration.',
      thumbnailSmallUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/aso-oke_1_vdvwnw.png',
      thumbnailLargeUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/aso-oke_qtypsn.png',
      color: '#AB491F', // Primary/600 - warm rust orange
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Akwete',
      slug: 'akwete',
      description:
        'Distinctive hand-woven textile from Akwete, Abia State — known for its bold geometric designs.',
      thumbnailSmallUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-small_dsy242.png',
      thumbnailLargeUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791282348/akwete-big_jv3bj3.png',
      color: '#676670', // Neutral/500 - elegant graphite slate
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Lace',
      slug: 'lace',
      description:
        'Intricate and elegant luxury lace fabric, a staple for Nigerian celebrations and ceremonies.',
      thumbnailSmallUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/lace_1_cruzn4.png',
      thumbnailLargeUrl:
        'https://res.cloudinary.com/dymntdsp9/image/upload/v1791048028/lace_vxlyec.png',
      color: '#CAA8F5', // Secondary - Amethyst/300 - soft lilac lavender
      defaultPrice: 100000,
      currency: 'NGN',
    },
  ];

  for (const mat of DEFAULT_MATERIALS) {
    await prisma.material.upsert({
      where: { slug: mat.slug },
      update: {
        description: mat.description,
        thumbnailSmallUrl: mat.thumbnailSmallUrl,
        thumbnailLargeUrl: mat.thumbnailLargeUrl,
        color: mat.color,
      },
      create: {
        ...mat,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✅ Default platform materials seeded with universal base price (₦1,000) and hexadecimal colors.');

  console.log('🌱 Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
