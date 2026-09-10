import { Controller, Post, Delete, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FollowsService } from './follows.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('follows')
@ApiBearerAuth()
@Controller()
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post('creators/:id/follow')
  @ApiOperation({ summary: 'Follow a creator' })
  async follow(
    @CurrentUser('id') supporterId: string,
    @Param('id') creatorId: string,
  ) {
    return this.followsService.followCreator(supporterId, creatorId);
  }

  @Delete('creators/:id/follow')
  @ApiOperation({ summary: 'Unfollow a creator' })
  async unfollow(
    @CurrentUser('id') supporterId: string,
    @Param('id') creatorId: string,
  ) {
    return this.followsService.unfollowCreator(supporterId, creatorId);
  }

  @Get('me/following')
  @ApiOperation({ summary: 'Get creators followed by current user' })
  async getFollowing(@CurrentUser('id') supporterId: string) {
    return this.followsService.getFollowing(supporterId);
  }
}
