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

  // 4. Seed Base Fabric Materials
  console.log('Seeding base fabric materials catalogue...');
  const baseMaterials = [
    {
      name: 'Ankara',
      slug: 'ankara',
      description: 'Vibrant African wax print fabric',
      defaultPrice: 500000, // NGN 5,000 in kobo
      currency: 'NGN',
    },
    {
      name: 'Lace',
      slug: 'lace',
      description: 'Elegant French and cord lace fabric',
      defaultPrice: 1500000, // NGN 15,000 in kobo
      currency: 'NGN',
    },
    {
      name: 'Aso-oke',
      slug: 'aso-oke',
      description: 'Traditional handwoven Yoruba textile',
      defaultPrice: 2500000, // NGN 25,000 in kobo
      currency: 'NGN',
    },
    {
      name: 'Adire',
      slug: 'adire',
      description: 'Indigo dyed resist-patterned cloth',
      defaultPrice: 800000, // NGN 8,000 in kobo
      currency: 'NGN',
    },
  ];

  const seededMaterials = [];
  for (const mat of baseMaterials) {
    const item = await prisma.material.upsert({
      where: { slug: mat.slug },
      update: {
        name: mat.name,
        description: mat.description,
        defaultPrice: mat.defaultPrice,
      },
      create: mat,
    });
    seededMaterials.push(item);
  }
  console.log(`✅ ${seededMaterials.length} base materials seeded.`);

  // 5. Seed Demo Creator User (Chef Amaka)
  const creatorEmail = 'creator@buymeayard.com';
  const creatorPassword = 'Password123!';

  let creatorUser = await prisma.user.findUnique({
    where: { email: creatorEmail },
  });

  if (!creatorUser) {
    console.log(`Creating demo creator user (${creatorEmail})...`);
    const res = await auth.api.signUpEmail({
      body: {
        email: creatorEmail,
        password: creatorPassword,
        name: 'Chef Amaka',
      },
      asResponse: true,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Failed to create creator user:', err);
    } else {
      creatorUser = await prisma.user.findUnique({
        where: { email: creatorEmail },
      });
      console.log('✅ Demo creator user created.');
    }
  }

  if (creatorUser) {
    // Attach CREATOR and SUPPORTER roles
    const creatorRole = await prisma.role.findUnique({ where: { name: 'CREATOR' } });
    const supporterRole = await prisma.role.findUnique({ where: { name: 'SUPPORTER' } });

    if (creatorRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: creatorUser.id,
            roleId: creatorRole.id,
          },
        },
        update: {},
        create: {
          userId: creatorUser.id,
          roleId: creatorRole.id,
        },
      });
    }

    if (supporterRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: creatorUser.id,
            roleId: supporterRole.id,
          },
        },
        update: {},
        create: {
          userId: creatorUser.id,
          roleId: supporterRole.id,
        },
      });
    }

    // Upsert CreatorProfile with KYC VERIFIED for testing
    const creatorProfile = await prisma.creatorProfile.upsert({
      where: { userId: creatorUser.id },
      update: {
        creatorName: 'Chef Amaka',
        slug: 'chefamaka',
        bio: 'Food creator & African culinary enthusiast sharing secret recipes and cultural yard vibes.',
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
      },
      create: {
        userId: creatorUser.id,
        creatorName: 'Chef Amaka',
        slug: 'chefamaka',
        bio: 'Food creator & African culinary enthusiast sharing secret recipes and cultural yard vibes.',
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
      },
    });
    console.log(`✅ Creator profile created: /${creatorProfile.slug} (KYC: VERIFIED)`);

    // Assign Creator Materials
    for (const mat of seededMaterials) {
      await prisma.creatorMaterial.upsert({
        where: {
          creatorId_materialId: {
            creatorId: creatorProfile.id,
            materialId: mat.id,
          },
        },
        update: {
          price: mat.defaultPrice,
          displayName: `A Yard of ${mat.name}`,
          status: 'ACTIVE',
        },
        create: {
          creatorId: creatorProfile.id,
          materialId: mat.id,
          price: mat.defaultPrice,
          displayName: `A Yard of ${mat.name}`,
          currency: 'NGN',
          status: 'ACTIVE',
        },
      });
    }
    console.log('✅ Creator materials configured.');

    // Configure a default payout method (Guaranty Trust Bank)
    await prisma.payoutMethod.deleteMany({
      where: { creatorId: creatorProfile.id },
    });

    await prisma.payoutMethod.create({
      data: {
        creatorId: creatorProfile.id,
        type: 'BANK_ACCOUNT',
        provider: 'PAYSTACK',
        accountIdentifier: 'RCP_mock_amaka_058',
        accountName: 'Amaka Okafor',
        bankName: 'Guaranty Trust Bank',
        status: 'ACTIVE',
        isDefault: true,
      },
    });
    console.log('✅ Default payout method attached (GTBank - Amaka Okafor).');
  }

  // 6. Seed Demo Supporter User (Tunde Daniels)
  const supporterEmail = 'supporter@buymeayard.com';
  const supporterPassword = 'Password123!';

  let supporterUser = await prisma.user.findUnique({
    where: { email: supporterEmail },
  });

  if (!supporterUser) {
    console.log(`Creating demo supporter user (${supporterEmail})...`);
    const res = await auth.api.signUpEmail({
      body: {
        email: supporterEmail,
        password: supporterPassword,
        name: 'Tunde Daniels',
      },
      asResponse: true,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Failed to create supporter user:', err);
    } else {
      supporterUser = await prisma.user.findUnique({
        where: { email: supporterEmail },
      });
      console.log('✅ Demo supporter user created.');
    }
  }

  if (supporterUser) {
    const supporterRole = await prisma.role.findUnique({ where: { name: 'SUPPORTER' } });
    if (supporterRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: supporterUser.id,
            roleId: supporterRole.id,
          },
        },
        update: {},
        create: {
          userId: supporterUser.id,
          roleId: supporterRole.id,
        },
      });
      console.log('✅ SUPPORTER role attached to supporter user.');
    }
  }

  console.log('🌱 Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

