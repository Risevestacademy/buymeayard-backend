import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { GetWaitlistQueryDto } from './dto/get-waitlist-query.dto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  async joinWaitlist(dto: JoinWaitlistDto) {
    const email = dto.email.trim().toLowerCase();

    // Check if the email is already in the waitlist
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });

    if (existing) {
      this.logger.log(`Waitlist duplicate attempt for email: ${email}`);
      return {
        message: "You're already on the waitlist!",
        alreadyJoined: true,
        entry: existing,
      };
    }

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        email,
      },
    });

    this.logger.log(`New waitlist entry added: ${email} (ID: ${entry.id})`);

    return {
      message: 'Successfully joined the waitlist!',
      alreadyJoined: false,
      entry,
    };
  }

  async getWaitlist(query: GetWaitlistQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 50;
    const skip = (page - 1) * limit;

    const where: Prisma.WaitlistEntryWhereInput = {};

    if (query.search?.trim()) {
      where.email = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [total, entries] = await Promise.all([
      this.prisma.waitlistEntry.count({ where }),
      this.prisma.waitlistEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
