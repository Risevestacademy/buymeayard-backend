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

async function main() {
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
  const adminEmail = 'admin@buymeayard.com';
  const adminPassword = 'AdminPassword123!';

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
      description: 'Traditional African wax print fabric, widely worn at celebrations and everyday occasions.',
      thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/ankara-sm',
      thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/ankara-lg',
      color: '#7F3516', // Primary/700 - rich terracotta earth
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Adire',
      slug: 'adire',
      description: 'Hand-crafted indigo-dyed fabric with rich Yoruba heritage and bold resist-dye patterns.',
      thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/adire-sm',
      thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/adire-lg',
      color: '#4A2E8A', // Secondary - Amethyst/600 - deep indigo purple
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Ochafu',
      slug: 'ochafu',
      description: 'Classic traditional woven textile fabric from eastern Nigeria, used for ceremonies and royalty.',
      thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/ochafu-sm',
      thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/ochafu-lg',
      color: '#54230E', // Primary/800 - deep royal umber
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Aso-Oke',
      slug: 'aso-oke',
      description: 'Hand-woven prestige cloth from the Yoruba people of Nigeria, synonymous with celebration.',
      thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/aso-oke-sm',
      thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/aso-oke-lg',
      color: '#AB491F', // Primary/600 - warm rust orange
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Akwete',
      slug: 'akwete',
      description: 'Distinctive hand-woven textile from Akwete, Abia State — known for its bold geometric designs.',
      thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/akwete-sm',
      thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/akwete-lg',
      color: '#676670', // Neutral/500 - elegant graphite slate
      defaultPrice: 100000,
      currency: 'NGN',
    },
    {
      name: 'Lace',
      slug: 'lace',
      description: 'Intricate and elegant luxury lace fabric, a staple for Nigerian celebrations and ceremonies.',
      thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/lace-sm',
      thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/lace-lg',
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
