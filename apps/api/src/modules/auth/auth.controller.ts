import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  All,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account with email and password',
  })
  @SwaggerResponse({ status: 201, description: 'User successfully registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.signUpEmail(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @SwaggerResponse({ status: 200, description: 'User successfully logged in' })
  async login(@Body() dto: LoginDto) {
    return this.authService.signInEmail(dto);
  }

  @Public()
  @Get('session')
  @ApiOperation({ summary: 'Get current authenticated user session' })
  async getSession(@Req() req: Request) {
    return this.authService.getSessionFromNodeHeaders(req.headers);
  }

  @Public()
  @All('*')
  @ApiOperation({ summary: 'Better Auth native SDK handler endpoint' })
  async handleBetterAuth(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(this.authService.getAuth())(req, res);
  }
}
