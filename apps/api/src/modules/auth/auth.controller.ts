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
  ApiBearerAuth,
  ApiHeader,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { fromNodeHeaders } from '../../common/utils/headers.util';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  isMobileRequest,
  extractSessionToken,
} from '../../common/utils/client-detection.util';

@ApiTags('auth')
@ApiHeader({
  name: 'x-client-type',
  required: false,
  description:
    'Optional. Set to "mobile" or "app" to identify as a mobile client. This alters the authentication behavior for mobile apps (e.g. enforcing the CREATOR role).',
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account with email and password',
    description:
      'Creates a new user account. All users are registered as CREATORS by default.',
  })
  @SwaggerResponse({
    status: 201,
    description: 'User successfully registered and logged in.',
  })
  @SwaggerResponse({
    status: 400,
    description: 'Invalid input data or validation error.',
  })
  @SwaggerResponse({
    status: 409,
    description: 'User with this email already exists.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.signUpEmail({
      ...dto,
      headers: fromNodeHeaders(req.headers),
    });
    const body = await this.handleAuthResponse(
      webRes,
      req,
      res,
      HttpStatus.CREATED,
    );
    if (body && typeof body === 'object' && body.user?.id) {
      body.isOnboarded = await this.authService.getIsOnboarded(body.user.id);
    }
    return body;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Authenticates a user and starts a session. Web clients will receive an HTTP-only session cookie. Mobile clients will receive a JSON token.',
  })
  @SwaggerResponse({
    status: 200,
    description: 'User successfully logged in. Session token returned.',
  })
  @SwaggerResponse({
    status: 400,
    description: 'Invalid credentials or validation error.',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.signInEmail({
      ...dto,
      headers: fromNodeHeaders(req.headers),
    });
    const body = await this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
    if (body && typeof body === 'object' && body.user?.id) {
      body.isOnboarded = await this.authService.getIsOnboarded(body.user.id);
    }
    return body;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out current session',
    description:
      'Invalidates the current active session. Clears cookies for web clients.',
  })
  @SwaggerResponse({
    status: 200,
    description: 'User successfully logged out.',
  })
  @SwaggerResponse({ status: 401, description: 'No active session found.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const webRes = await this.authService.signOut({
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Public()
  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current authenticated user session',
    description:
      'Retrieves the currently authenticated user details based on the session token (cookie or header).',
  })
  @SwaggerResponse({ status: 200, description: 'Active session returned.' })
  @SwaggerResponse({
    status: 401,
    description: 'Unauthorized. No active session.',
  })
  async getSession(@Req() req: Request) {
    return this.authService.getSessionFromNodeHeaders(req.headers);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Sends a password reset link to the specified email address if the account exists.',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Password reset email sent successfully.',
  })
  @SwaggerResponse({
    status: 400,
    description: 'Validation error for the email.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.forgotPassword({
      email: dto.email,
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using a token from the reset email',
    description:
      "Updates the user's password if the provided reset token is valid and not expired.",
  })
  @SwaggerResponse({ status: 200, description: 'Password successfully reset.' })
  @SwaggerResponse({
    status: 400,
    description: 'Invalid or expired reset token, or weak password.',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.resetPassword({
      token: dto.token,
      newPassword: dto.newPassword,
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password for the authenticated user',
    description:
      'Allows an authenticated user to change their password by providing their current password and a new one.',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Password successfully changed.',
  })
  @SwaggerResponse({
    status: 400,
    description:
      'Current password does not match (PASSWORD_MISMATCH) or new password is too weak.',
  })
  @SwaggerResponse({
    status: 401,
    description: 'Unauthorized. Active session required.',
  })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.changePassword({
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address using a token',
    description:
      "Marks a user's email address as verified using the token sent in the verification email.",
  })
  @SwaggerResponse({ status: 200, description: 'Email successfully verified.' })
  @SwaggerResponse({
    status: 400,
    description: 'Invalid or expired verification token.',
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webRes = await this.authService.verifyEmail({
      token: dto.token,
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend email verification link to the authenticated user',
    description:
      "Triggers a new verification email to be sent to the currently authenticated user's registered email address.",
  })
  @SwaggerResponse({
    status: 200,
    description: 'Verification email sent successfully.',
  })
  @SwaggerResponse({
    status: 401,
    description: 'Unauthorized. Active session required.',
  })
  @SwaggerResponse({
    status: 429,
    description:
      'Too many requests. Please wait before requesting another email.',
  })
  async sendVerificationEmail(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('email') email: string,
  ) {
    const webRes = await this.authService.sendVerificationEmail({
      email,
      headers: fromNodeHeaders(req.headers),
    });
    return this.handleAuthResponse(webRes, req, res, HttpStatus.OK);
  }

  @Public()
  @All('*')
  @ApiExcludeEndpoint()
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
