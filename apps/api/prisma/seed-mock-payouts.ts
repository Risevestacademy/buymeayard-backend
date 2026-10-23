/**
 * Development-only mock data: contributions (supports + payments + ledger) and
 * payouts for EVERY creator, so the Payouts and Contributions screens have
 * something to show.
 *
 *   pnpm --filter @buymeayard/api exec ts-node prisma/seed-mock-payouts.ts          # add
 *   pnpm --filter @buymeayard/api exec ts-node prisma/seed-mock-payouts.ts --clean  # remove
 *
 * Every row is tagged with a MOCK_ reference (or MOCK-PYT- payout reference), so
 * --clean removes exactly what this script created. Re-running replaces the
 * mock rows. Never run against production.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MOCK = 'MOCK_';
const FEE_PERCENTAGE = Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10;
const DAY = 24 * 60 * 60 * 1000;

const GUESTS = [
  ['Tunde Bakare', 'tunde@example.com'],
  ['Amaka Obi', 'amaka@example.com'],
  ['Chidi Eze', 'chidi@example.com'],
  ['Funke Adeyemi', 'funke@example.com'],
  ['Ngozi Nwosu', 'ngozi@example.com'],
  ['Segun Alade', 'segun@example.com'],
  ['Zainab Musa', 'zainab@example.com'],
];
const MESSAGES = [
  'Love your work, keep going!',
  'Thank you for the great content.',
  'Small token of appreciation.',
  null,
  'Keep it up! 🔥',
  null,
];
const AMOUNTS = [100_000, 200_000, 300_000, 500_000, 1_000_000, 1_500_000, 2_500_000];
const BANKS = [
  { bankName: 'GTBank', bankCode: '058' },
  { bankName: 'Access Bank', bankCode: '044' },
  { bankName: 'Zenith Bank', bankCode: '057' },
];

/** Deterministic pseudo-random so every run looks the same. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function clean() {
  const supports = await prisma.support.findMany({
    where: { payment: { providerReference: { startsWith: MOCK } } },
    select: { id: true },
  });
  const supportIds = supports.map((s) => s.id);
  const payouts = await prisma.payout.findMany({
    where: { reference: { startsWith: 'MOCK-PYT-' } },
    select: { id: true },
  });
  const payoutIds = payouts.map((p) => p.id);
  const txIds = [...supportIds, ...payoutIds];

  await prisma.$transaction([
    prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: txIds } } }),
    prisma.payout.deleteMany({ where: { id: { in: payoutIds } } }),
    prisma.support.deleteMany({ where: { id: { in: supportIds } } }), // cascades items + payments
    prisma.payoutMethod.deleteMany({
      where: { recipientCode: { startsWith: MOCK } },
    }),
    prisma.creatorMaterial.deleteMany({
      where: { displayName: { startsWith: MOCK } },
    }),
  ]);
  console.log(
    `🧹 Removed ${supportIds.length} mock contributions and ${payoutIds.length} mock payouts.`,
  );
}

async function accountFor(ownerType: string, ownerId: string) {
  return prisma.account.upsert({
    where: {
      ownerType_ownerId_currency: { ownerType, ownerId, currency: 'NGN' },
    },
    update: {},
    create: { ownerType, ownerId, currency: 'NGN', status: 'ACTIVE' },
  });
}

async function seedCreator(
  creator: { id: string; slug: string },
  index: number,
) {
  const rand = rng(index + 1);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const creatorAccount = await accountFor('CREATOR', creator.id);
  const platformAccount = await accountFor('PLATFORM', 'PLATFORM');

  // A creator material to hang support items on. Creators with none get a
  // hidden (INACTIVE) one so their public page is unchanged.
  let creatorMaterial = await prisma.creatorMaterial.findFirst({
    where: { creatorId: creator.id },
    include: { material: true },
  });
  if (!creatorMaterial) {
    const material = await prisma.material.findFirstOrThrow({
      where: { slug: 'ankara' },
    });
    creatorMaterial = await prisma.creatorMaterial.create({
      data: {
        creatorId: creator.id,
        materialId: material.id,
        price: material.defaultPrice,
        displayName: `${MOCK}${material.name}`,
        status: 'INACTIVE',
      },
      include: { material: true },
    });
  }
  const materialName =
    creatorMaterial.displayName?.replace(MOCK, '') ||
    creatorMaterial.material.name;
  const unitPrice = creatorMaterial.price || 100_000;

  // --- Contributions: 14 over the last ~90 days, newest first -------------
  const count = 14;
  let earned = 0;
  for (let i = 0; i < count; i++) {
    const [guestName, guestEmail] = pick(GUESTS);
    const amount = pick(AMOUNTS);
    const platformFee = Math.round((amount * FEE_PERCENTAGE) / 100);
    const creatorAmount = amount - platformFee;
    const createdAt = new Date(
      Date.now() - (i * 6 + Math.floor(rand() * 5)) * DAY - rand() * DAY,
    );
    const ref = `${MOCK}${creator.slug}_${i}`;

    const support = await prisma.support.create({
      data: {
        supporterId: null,
        creatorId: creator.id,
        guestName,
        guestEmail,
        isAnonymous: i % 5 === 4,
        message: pick(MESSAGES),
        subtotal: amount,
        platformFee,
        creatorAmount,
        totalAmount: amount,
        currency: 'NGN',
        status: 'PAID',
        createdAt,
        updatedAt: createdAt,
        items: {
          create: {
            creatorMaterialId: creatorMaterial.id,
            materialNameSnapshot: materialName,
            unitPrice,
            quantity: Math.round((amount / unitPrice) * 100) / 100,
            totalPrice: amount,
            currency: 'NGN',
            createdAt,
          },
        },
        payment: {
          create: {
            provider: 'PAYSTACK',
            providerReference: ref,
            amount,
            currency: 'NGN',
            status: 'SUCCESS',
            paidAt: createdAt,
            createdAt,
          },
        },
      },
    });
    await prisma.ledgerEntry.createMany({
      data: [
        {
          accountId: creatorAccount.id,
          transactionId: support.id,
          entryType: 'SUPPORT_PAYMENT',
          direction: 'CREDIT',
          amount: creatorAmount,
          reference: `SUPPORT_${support.id}`,
          createdAt,
        },
        {
          accountId: platformAccount.id,
          transactionId: support.id,
          entryType: 'PLATFORM_FEE',
          direction: 'CREDIT',
          amount: platformFee,
          reference: `FEE_${support.id}`,
          createdAt,
        },
      ],
    });
    earned += creatorAmount;
  }

  // --- Payout bank account (reuse the creator's own if they have one) -----
  let method = await prisma.payoutMethod.findFirst({
    where: { creatorId: creator.id, status: 'ACTIVE' },
  });
  if (!method) {
    const bank = BANKS[index % BANKS.length];
    method = await prisma.payoutMethod.create({
      data: {
        creatorId: creator.id,
        accountIdentifier: `0${String(100000000 + index * 7919).slice(0, 9)}`,
        accountName: `${creator.slug} (mock)`,
        ...bank,
        recipientCode: `${MOCK}${creator.slug}`,
        isDefault: true,
        verifiedAt: new Date(),
      },
    });
  }

  // --- Payouts: one of each status, sized to fit what was earned ----------
  const plan: { status: string; share: number; daysAgo: number; failureReason?: string }[] = [
    { status: 'SUCCESS', share: 0.3, daysAgo: 40 },
    { status: 'SUCCESS', share: 0.2, daysAgo: 20 },
    { status: 'FAILED', share: 0.1, daysAgo: 10, failureReason: 'Bank account could not be credited. Please check your details.' },
    { status: 'PROCESSING', share: 0.1, daysAgo: 1 },
    { status: 'REQUESTED', share: 0.05, daysAgo: 0 },
  ];
  let n = 0;
  for (const p of plan) {
    const amount = Math.max(100_000, Math.round((earned * p.share) / 1000) * 1000);
    const fee = amount <= 5_000_000 ? 5_000 : 10_000;
    const requestedAt = new Date(Date.now() - p.daysAgo * DAY);
    const reference = `MOCK-PYT-${creator.slug}-${++n}`;
    const payout = await prisma.payout.create({
      data: {
        creatorId: creator.id,
        accountId: creatorAccount.id,
        payoutMethodId: method.id,
        reference,
        providerReference: reference.toLowerCase(),
        amount,
        fee,
        netAmount: amount - fee,
        currency: 'NGN',
        status: p.status,
        bankName: method.bankName,
        bankCode: method.bankCode,
        accountName: method.accountName,
        accountNumberLast4: method.accountIdentifier.slice(-4),
        requestedAt,
        processedAt: ['SUCCESS', 'FAILED'].includes(p.status)
          ? new Date(requestedAt.getTime() + 60 * 60 * 1000)
          : null,
        failureReason: p.failureReason ?? null,
        createdAt: requestedAt,
      },
    });
    // Same ledger shape as the real flow: reserve on request, reverse on failure
    await prisma.ledgerEntry.create({
      data: {
        accountId: creatorAccount.id,
        transactionId: payout.id,
        entryType: 'PAYOUT_RESERVATION',
        direction: 'DEBIT',
        amount,
        reference: `PAYOUT_RESERVE_${payout.id}`,
        createdAt: requestedAt,
      },
    });
    if (p.status === 'FAILED') {
      await prisma.ledgerEntry.create({
        data: {
          accountId: creatorAccount.id,
          transactionId: payout.id,
          entryType: 'PAYOUT_REVERSED',
          direction: 'CREDIT',
          amount,
          reference: `PAYOUT_REVERSE_${payout.id}`,
          createdAt: payout.processedAt ?? requestedAt,
        },
      });
    }
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed mock data in production.');
  }
  await clean();
  if (process.argv.includes('--clean')) return;

  const creators = await prisma.creatorProfile.findMany({
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const [i, creator] of creators.entries()) {
    await seedCreator(creator, i);
    console.log(`✅ ${creator.slug}`);
  }
  console.log(`🌱 Mock contributions and payouts added for ${creators.length} creators.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
