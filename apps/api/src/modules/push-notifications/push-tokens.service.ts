import { BadRequestException, Injectable } from '@nestjs/common';
import { Expo } from 'expo-server-sdk';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert by token. A token already held by another user is reassigned,
   * which covers user A logging out and user B logging in on the same phone.
   */
  async register(userId: string, dto: RegisterPushTokenDto): Promise<void> {
    if (!Expo.isExpoPushToken(dto.token)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      update: { userId, platform: dto.platform },
      create: { token: dto.token, userId, platform: dto.platform },
    });
  }

  /** Only removes the caller's own token; a missing token is not an error. */
  async remove(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
  }

  /** Drops tokens Expo reported as no longer registered. */
  async removeInvalid(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.prisma.pushToken.deleteMany({
      where: { token: { in: tokens } },
    });
  }

  async findForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }
}
