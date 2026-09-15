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
  }

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
