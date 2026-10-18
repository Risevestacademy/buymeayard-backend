import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { GetWaitlistQueryDto } from './dto/get-waitlist-query.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply / Join the platform waitlist' })
  @ApiResponse({
    status: 201,
    description:
      'User successfully joined or already registered on the waitlist',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email address provided',
  })
  async joinWaitlist(@Body() dto: JoinWaitlistDto) {
    return this.waitlistService.joinWaitlist(dto);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get all waitlist entries with pagination and search',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of waitlist members',
  })
  async getWaitlist(@Query() query: GetWaitlistQueryDto) {
    return this.waitlistService.getWaitlist(query);
  }
}
