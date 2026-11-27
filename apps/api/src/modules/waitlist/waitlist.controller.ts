import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
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
    type: ErrorResponseDto,
  })
  async joinWaitlist(@Body() dto: JoinWaitlistDto) {
    return this.waitlistService.joinWaitlist(dto);
  }
}
