import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PostVisibility } from '@buymeayard/types';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async findPostsForCreator(creatorUsername: string, viewerUserId?: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { username: creatorUsername },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }

    const posts = await this.prisma.post.findMany({
      where: {
        creatorId: creator.id,
        status: 'PUBLISHED',
      },
      include: {
        media: {
          include: {
            media: true,
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });

    // Strip private media if viewer does not have entitlement
    return Promise.all(
      posts.map(async (post) => {
        if (post.visibility === PostVisibility.PUBLIC) {
          return post;
        }

        const isOwner = viewerUserId === creator.userId;
        if (isOwner) {
          return post;
        }

        const hasEntitlement = viewerUserId
          ? await this.hasEntitlement(post.id, viewerUserId)
          : false;

        if (!hasEntitlement) {
          // Mask private media and content
          return {
            id: post.id,
            creatorId: post.creatorId,
            title: post.title,
            body: 'This content is exclusive to supporters.',
            visibility: post.visibility,
            status: post.status,
            publishedAt: post.publishedAt,
            isLocked: true,
            media: [],
          };
        }

        return {
          ...post,
          isLocked: false,
        };
      }),
    );
  }

  private async hasEntitlement(
    postId: string,
    supporterUserId: string,
  ): Promise<boolean> {
    const entitlement = await this.prisma.postEntitlement.findFirst({
      where: {
        postId,
        supporterId: supporterUserId,
      },
    });

    return !!entitlement;
  }
}
