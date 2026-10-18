import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KycAdminService } from './kyc-admin.service';
import {
  AdminKycApproveDto,
  AdminKycRejectDto,
  KycQueueQueryDto,
} from './dto/admin-kyc.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/kyc')
export class KycAdminController {
  constructor(private readonly kycAdminService: KycAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'List KYC submissions (defaults to the review queue)',
  })
  async list(@Query() query: KycQueueQueryDto) {
    return this.kycAdminService.listQueue(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get a KYC submission with the live provider decision',
    description:
      'Media URLs in providerDecision are short-lived. Access is audit-logged.',
  })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.kycAdminService.getDetail(id, adminId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a submission in review (or override a rejection)',
  })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminKycApproveDto,
  ) {
    return this.kycAdminService.approve(id, adminId, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a submission in review' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminKycRejectDto,
  ) {
    return this.kycAdminService.reject(id, adminId, dto.reason, dto.note);
  }

  @Post('creators/:creatorId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a creator verification',
    description:
      'Unpublishes the creator and disables contributions and payouts.',
  })
  async revoke(
    @Param('creatorId', ParseUUIDPipe) creatorId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminKycRejectDto,
  ) {
    return this.kycAdminService.revoke(
      creatorId,
      adminId,
      dto.reason,
      dto.note,
    );
  }

  @Post('creators/:creatorId/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lift a revocation block so the creator can verify again',
  })
  async unblock(
    @Param('creatorId', ParseUUIDPipe) creatorId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminKycApproveDto,
  ) {
    return this.kycAdminService.unblock(creatorId, adminId, dto.note);
  }
}
