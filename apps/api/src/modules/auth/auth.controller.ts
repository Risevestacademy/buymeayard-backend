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
  HttpException,
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
import { fromNodeHeaders } from '../../common/utils/headers.util';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  isMobileRequest,
  extractSessionToken,
} from '../../common/utils/client-detection.util';

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
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.signUpEmail({
      ...dto,
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.CREATED);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @SwaggerResponse({ status: 200, description: 'User successfully logged in' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.signInEmail({
      ...dto,
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out current session' })
  @SwaggerResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const webRes = await this.authService.signOut({
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
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
    // If mobile request header is present, suppress Set-Cookie from native handler
    if (isMobileRequest(req.headers)) {
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = function (name: string, value: any) {
        if (name.toLowerCase() === 'set-cookie') {
          return res;
        }
        return originalSetHeader(name, value);
      };
    }
    return toNodeHandler(this.authService.getAuth())(req, res);
  }

  private async handleAuthResponse(
    webRes: globalThis.Response,
    req: Request,
    res: Response,
    successStatus: HttpStatus,
  ) {
    const isMobile = isMobileRequest(req.headers);

    // 1. Read body
    const contentType = webRes.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    let body = isJson ? await webRes.json() : await webRes.text();

    // 2. Translate Better Auth errors into proper Nest HttpExceptions with correct HTTP status codes
    if (!webRes.ok) {
      const status = webRes.status;
      const message =
        typeof body === 'object' && body !== null
          ? body.message || body.error || 'Authentication request failed'
          : body || 'Authentication request failed';

      const code =
        typeof body === 'object' && body !== null && body.code
          ? body.code
          : status === 401
            ? ErrorCodes.UNAUTHORIZED
            : status === 409
              ? ErrorCodes.CONFLICT
              : status === 403
                ? ErrorCodes.FORBIDDEN
                : ErrorCodes.BAD_REQUEST;

      throw new HttpException({ code, message, details: body }, status);
    }

    const token = extractSessionToken(webRes, body);

    if (isMobile) {
      // Mobile Request:
      // - Explicitly do NOT set cookie (suppress Set-Cookie)
      res.removeHeader('set-cookie');

      // - Return session token in JSON response body
      if (typeof body === 'object' && body !== null) {
        body = {
          token: token || body.token || null,
          ...body,
        };
      }

      // - Also expose Bearer token in headers for mobile clients
      if (token) {
        res.setHeader('authorization', `Bearer ${token}`);
        res.setHeader('set-auth-token', token);
      }
    } else {
      // Web Frontend:
      // - Keep cookies enabled and forward Set-Cookie headers
      if (typeof (webRes.headers as any).getSetCookie === 'function') {
        const setCookies = (webRes.headers as any).getSetCookie();
        if (Array.isArray(setCookies) && setCookies.length > 0) {
          res.setHeader('set-cookie', setCookies);
        }
      } else {
        const setCookie = webRes.headers.get('set-cookie');
        if (setCookie) {
          res.setHeader('set-cookie', setCookie);
        }
      }

      const tokenHeader =
        webRes.headers.get('set-auth-token') ||
        webRes.headers.get('authorization');
      if (tokenHeader) {
        res.setHeader('authorization', tokenHeader);
      }
    }

    res.status(successStatus);
    return body;
  }
}
