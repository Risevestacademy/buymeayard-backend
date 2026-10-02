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
