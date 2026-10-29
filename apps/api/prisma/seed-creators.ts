/**
 * Seeds a few verified, published creators so gifting can be tried end to end.
 * Run `prisma/seed.ts` first (roles and platform materials).
 *
 *   CREATORS_PASSWORD='<12+ chars>' pnpm exec ts-node prisma/seed-creators.ts
 *
 * Idempotent: existing users, profiles and menu items are left as they are.
 * Each creator gets a VERIFIED KYC submission so the KYC sync keeps them ACTIVE.
 */
import { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

const prisma = new PrismaClient();

const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  account: { modelName: 'authAccount' },
  secret: process.env.BETTER_AUTH_SECRET || 'seed-secret',
  emailAndPassword: { enabled: true },
});

const CREATORS = [
  {
    email: 'adeola@buymeayard.com',
    name: 'Adeola Johnson',
    slug: 'adeola',
    bio: 'Illustrator and storyteller from Lagos.',
    theme: 'adire',
  },
  {
    email: 'tunde@buymeayard.com',
    name: 'Tunde Crafts',
    slug: 'tunde-crafts',
    bio: 'Weaver keeping Aso-Oke traditions alive.',
    theme: 'aso-oke',
  },
  {
    email: 'ngozi@buymeayard.com',
    name: 'Ngozi Weaves',
    slug: 'ngozi-weaves',
    bio: 'Ankara designs and tutorials.',
    theme: 'ankara',
  },
];

async function main() {
  const password = process.env.CREATORS_PASSWORD || '';
  if (password.length < 12) {
    throw new Error('Set CREATORS_PASSWORD to a password of 12+ characters.');
  }

  const creatorRole = await prisma.role.upsert({
    where: { name: 'CREATOR' },
    update: {},
    create: { name: 'CREATOR' },
  });
  const materials = await prisma.material.findMany({
    where: { status: 'ACTIVE', creatorId: null },
    orderBy: { createdAt: 'asc' },
  });
  if (materials.length === 0) {
    throw new Error('No platform materials found. Run prisma/seed.ts first.');
  }

  for (const c of CREATORS) {
    let user = await prisma.user.findUnique({ where: { email: c.email } });
    if (!user) {
      const res = await auth.api.signUpEmail({
        body: { email: c.email, password, name: c.name },
        asResponse: true,
      });
      if (!res.ok) {
        throw new Error(`Failed to create ${c.email}: ${await res.text()}`);
      }
      user = await prisma.user.findUniqueOrThrow({ where: { email: c.email } });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, name: c.name },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: creatorRole.id } },
      update: {},
      create: { userId: user.id, roleId: creatorRole.id },
    });

    const theme = materials.find((m) => m.slug === c.theme) ?? materials[0];
    const profile = await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        creatorName: c.name,
        slug: c.slug,
        bio: c.bio,
        themeMaterialId: theme.id,
        isPublished: true,
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
        kycVerifiedAt: new Date(),
      },
    });

    for (const m of materials) {
      await prisma.creatorMaterial.upsert({
        where: {
          creatorId_materialId: { creatorId: profile.id, materialId: m.id },
        },
        update: {},
        create: {
          creatorId: profile.id,
          materialId: m.id,
          price: m.defaultPrice,
          currency: m.currency,
          displayName: m.name,
          status: 'ACTIVE',
        },
      });
    }

    const hasKyc = await prisma.kycSubmission.findFirst({
      where: { creatorId: profile.id },
    });
    if (!hasKyc) {
      await prisma.kycSubmission.create({
        data: {
          creatorId: profile.id,
          providerReference: `SEED-${c.slug}`,
          status: 'VERIFIED',
          completedAt: new Date(),
          metadata: { seeded: true },
        },
      });
    }
    console.log(`✅ Creator ${c.email} (/${c.slug})`);
  }
  console.log('🌱 Creator seeding finished.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
