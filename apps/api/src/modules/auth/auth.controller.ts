import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('session')
  @ApiOperation({ summary: 'Get current user session' })
  async getSession(@Req() req: any) {
    const sessionToken = req.cookies?.['better-auth.session_token'];
    return this.authService.getSession(sessionToken);
  }
}
