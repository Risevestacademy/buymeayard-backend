/**
 * Demo data for the tables the other seeds don't cover, so every endpoint
 * returns something on staging. Run after, in order:
 *
 *   seed.ts, seed-creators.ts, seed-mock-payouts.ts
 *
 * Covers: social links, posts + media, notifications + preferences, support
 * tickets, content reports, a pending refund, payment/KYC events, audit logs,
 * waitlist entries and platform settings. Rows use fixed `demo-` ids (or
 * natural keys), so re-running updates them instead of duplicating.
 * Not for production.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

const WAITLIST = [
  'chioma.eze@example.com',
  'bayo.ade@example.com',
  'halima.musa@example.com',
  'emeka.obi@example.com',
  'sade.bello@example.com',
  'kunle.ojo@example.com',
  'ifeoma.nwosu@example.com',
  'yusuf.garba@example.com',
];

async function main() {
  const creators = await prisma.creatorProfile.findMany({
    where: { kycStatus: 'VERIFIED' },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  if (creators.length === 0) {
    throw new Error('No verified creators. Run seed-creators.ts first.');
  }
  const admin = await prisma.user.findUnique({
    where: { email: process.env.ADMIN_EMAIL || 'admin@buymeayard.com' },
  });

  // Platform rules (the app merges these over its defaults)
  await prisma.platformSetting.upsert({
    where: { key: 'platform' },
    update: {},
    create: {
      key: 'platform',
      value: {
        platformFeePercent: 10,
        minimumWithdrawal: 100_000,
        payoutFeeTierLimit: 5_000_000,
        payoutFeeUpToLimit: 5_000,
        payoutFeeAboveLimit: 10_000,
      },
      updatedBy: admin?.id ?? null,
    },
  });

  for (const email of WAITLIST) {
    await prisma.waitlistEntry.upsert({
      where: { email },
      update: {},
      create: { email },
    });
  }

  const publishedPosts: { id: string; creatorUserId: string }[] = [];

  for (const [i, c] of creators.entries()) {
    const n = i + 1;

    // Social links
    for (const [platform, handle] of [
      ['instagram', `https://instagram.com/${c.slug}`],
      ['twitter', `https://x.com/${c.slug}`],
    ]) {
      const exists = await prisma.creatorSocialLink.findFirst({
        where: { creatorId: c.id, platform },
      });
      if (!exists) {
        await prisma.creatorSocialLink.create({
          data: { creatorId: c.id, platform, url: handle },
        });
      }
    }

    // Posts: public, exclusive, draft. Media only on the published ones.
    const posts = [
      {
        key: 'public',
        title: 'Behind the scenes this week',
        body: 'A look at how this month’s pieces came together.',
        visibility: 'PUBLIC',
        status: 'PUBLISHED',
      },
      {
        key: 'exclusive',
        title: 'Full pattern walkthrough',
        body: 'Step-by-step notes for people who have supported the page.',
        visibility: 'EXCLUSIVE',
        status: 'PUBLISHED',
      },
      {
        key: 'draft',
        title: 'Upcoming collection (draft)',
        body: 'Notes for the next release.',
        visibility: 'PUBLIC',
        status: 'DRAFT',
      },
    ];
    for (const [j, p] of posts.entries()) {
      const id = `demo-post-${n}-${p.key}`;
      const publishedAt = p.status === 'PUBLISHED' ? ago((j + 1) * 3 * DAY) : null;
      await prisma.post.upsert({
        where: { id },
        update: {},
        create: {
          id,
          creatorId: c.id,
          title: p.title,
          body: p.body,
          visibility: p.visibility,
          status: p.status,
          publishedAt,
        },
      });
      if (p.status === 'PUBLISHED') {
        publishedPosts.push({ id, creatorUserId: c.userId });
        const mediaId = `demo-media-${n}-${p.key}`;
        await prisma.media.upsert({
          where: { id: mediaId },
          update: {},
          create: {
            id: mediaId,
            ownerId: id,
            ownerType: 'POST',
            storageKey: `demo/${c.slug}/${p.key}.jpg`,
            mimeType: 'image/jpeg',
            mediaType: 'image',
            fileSize: 245_000,
          },
        });
        await prisma.postMedia.upsert({
          where: { postId_mediaId: { postId: id, mediaId } },
          update: {},
          create: { postId: id, mediaId, position: 0 },
        });
      }
    }

    // Notifications + preferences for the creator
    await prisma.notificationPreference.upsert({
      where: { userId: c.userId },
      update: {},
      create: { userId: c.userId },
    });
    const notifications = [
      {
        key: 'kyc',
        category: 'KYC',
        type: 'KYC_VERIFIED',
        title: 'Your identity is verified',
        body: 'Your page is live and can receive gifts.',
        actionUrl: '/dashboard',
        age: 6 * DAY,
        read: true,
      },
      {
        key: 'gift',
        category: 'CONTRIBUTION',
        type: 'CONTRIBUTION_RECEIVED',
        title: 'You received a gift',
        body: 'Tunde Bakare sent you ₦5,000 worth of Adire.',
        actionUrl: '/dashboard/contributions',
        age: 2 * DAY,
        read: false,
      },
      {
        key: 'payout',
        category: 'PAYOUT',
        type: 'PAYOUT_SUCCESS',
        title: 'Your withdrawal landed',
        body: '₦20,000 has reached your bank account.',
        actionUrl: '/dashboard/payouts',
        age: DAY,
        read: false,
      },
      {
        key: 'device',
        category: 'SECURITY',
        type: 'NEW_DEVICE_LOGIN',
        title: 'New sign-in to your account',
        body: 'Chrome on macOS in Lagos, Nigeria.',
        actionUrl: null,
        age: 5 * HOUR,
        read: false,
      },
    ];
    for (const nt of notifications) {
      const id = `demo-notif-${n}-${nt.key}`;
      await prisma.notification.upsert({
        where: { id },
        update: {},
        create: {
          id,
          userId: c.userId,
          category: nt.category,
          type: nt.type,
          title: nt.title,
          body: nt.body,
          actionUrl: nt.actionUrl,
          readAt: nt.read ? ago(nt.age - HOUR) : null,
          createdAt: ago(nt.age),
        },
      });
    }

    // KYC event + audit trail for the seeded verified submission
    const submission = await prisma.kycSubmission.findFirst({
      where: { creatorId: c.id },
      orderBy: { createdAt: 'desc' },
    });
    if (submission) {
      await prisma.kycEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: 'DIDIT',
            providerEventId: `demo-kyc-${c.slug}`,
          },
        },
        update: {},
        create: {
          provider: 'DIDIT',
          providerEventId: `demo-kyc-${c.slug}`,
          submission: { connect: { id: submission.id } },
          eventType: 'status.updated',
          providerStatus: 'Approved',
          payload: { status: 'Approved', seeded: true },
          createdAt: ago(7 * DAY),
        },
      });
      await prisma.auditLog.upsert({
        where: { id: `demo-audit-kyc-${n}` },
        update: {},
        create: {
          id: `demo-audit-kyc-${n}`,
          actorId: admin?.id ?? null,
          action: 'CREATOR_KYC_STATUS_CHANGED',
          resourceType: 'CREATOR_PROFILE',
          resourceId: c.id,
          previousState: { kycStatus: 'PENDING', status: 'KYC_PENDING' },
          newState: { kycStatus: 'VERIFIED', status: 'ACTIVE' },
          metadata: { source: 'seed', submissionId: submission.id },
          createdAt: ago(7 * DAY),
        },
      });
    }

    // Support tickets: one open (payout), one resolved (contribution)
    const payout = await prisma.payout.findFirst({
      where: { creatorId: c.id },
      orderBy: { requestedAt: 'desc' },
    });
    const support = await prisma.support.findFirst({
      where: { creatorId: c.id, status: { in: ['PAID', 'COMPLETED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (payout) {
      await prisma.supportTicket.upsert({
        where: { id: `demo-ticket-${n}-payout` },
        update: {},
        create: {
          id: `demo-ticket-${n}-payout`,
          userId: c.userId,
          payoutId: payout.id,
          message: 'My withdrawal is taking longer than usual. Can you check?',
          context: { reference: payout.reference, amount: payout.amount },
          status: 'OPEN',
          createdAt: ago(DAY),
        },
      });
    }
    if (support) {
      await prisma.supportTicket.upsert({
        where: { id: `demo-ticket-${n}-gift` },
        update: {},
        create: {
          id: `demo-ticket-${n}-gift`,
          userId: c.userId,
          supportId: support.id,
          message: 'The amount on this gift looks different from my receipt.',
          context: { creatorAmount: support.creatorAmount },
          status: 'RESOLVED',
          resolvedBy: admin?.id ?? null,
          resolvedAt: ago(DAY / 2),
          resolutionNote: 'Checked: the amount shown is after the platform fee.',
          createdAt: ago(3 * DAY),
        },
      });
      // Payment webhook record + one pending refund (first creator only)
      const payment = await prisma.payment.findUnique({
        where: { supportId: support.id },
      });
      if (payment) {
        await prisma.paymentEvent.upsert({
          where: {
            provider_providerEventId: {
              provider: 'PAYSTACK',
              providerEventId: `demo-charge-${payment.id}`,
            },
          },
          update: {},
          create: {
            paymentId: payment.id,
            eventType: 'charge.success',
            providerEventId: `demo-charge-${payment.id}`,
            payload: { event: 'charge.success', seeded: true },
          },
        });
        if (i === 0) {
          await prisma.refund.upsert({
            where: { id: 'demo-refund-1' },
            update: {},
            create: {
              id: 'demo-refund-1',
              paymentId: payment.id,
              amount: payment.amount,
              reason: 'Supporter paid twice',
              status: 'PENDING',
              initiatedBy: admin?.id ?? null,
            },
          });
        }
      }
    }
  }

  // Content reports: each creator reports another creator's post
  for (const [i, post] of publishedPosts.slice(0, 3).entries()) {
    const reporter = creators.find((c) => c.userId !== post.creatorUserId);
    if (!reporter) continue;
    await prisma.contentReport.upsert({
      where: { id: `demo-report-${i + 1}` },
      update: {},
      create: {
        id: `demo-report-${i + 1}`,
        reporterId: reporter.userId,
        contentId: post.id,
        reason: ['SPAM', 'INAPPROPRIATE', 'COPYRIGHT'][i],
        description: 'Flagged during demo seeding.',
        status: i === 2 ? 'RESOLVED' : 'PENDING',
        reviewedBy: i === 2 ? (admin?.id ?? null) : null,
        reviewedAt: i === 2 ? ago(DAY) : null,
        resolutionNote: i === 2 ? 'No issue found.' : null,
      },
    });
  }

  // Admin activity
  if (admin) {
    await prisma.auditLog.upsert({
      where: { id: 'demo-audit-admin-1' },
      update: {},
      create: {
        id: 'demo-audit-admin-1',
        actorId: admin.id,
        action: 'PLATFORM_SETTINGS_UPDATED',
        resourceType: 'PlatformSetting',
        resourceId: 'platform',
        newState: { platformFeePercent: 10 },
        createdAt: ago(10 * DAY),
      },
    });
  }

  console.log(`🌱 Demo data seeded for ${creators.length} creators.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
