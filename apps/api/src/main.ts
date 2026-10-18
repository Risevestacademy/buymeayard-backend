import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
// cookie-parser is CommonJS (`export =`) and esModuleInterop is off, so a default import would be undefined at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for webhook cryptographic signature verification
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  // Global prefix: /api/v1
  app.setGlobalPrefix('api/v1', {
    exclude: ['webhooks/(.*)', 'health'],
  });

  // Cookies & Security
  app.use(cookieParser());
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://buymeayard-main-dev.up.railway.app',
      'https://buymeayard-creator-dev.up.railway.app',
      'https://buymeayard-admin-dev.up.railway.app',
      'https://buymeayard-backend-staging.up.railway.app',
      'bmay://',
      'bmay-dev://',
      'bmay-preview://',
      'buymeayard://',
      ...(process.env.ADDITIONAL_TRUSTED_ORIGINS
        ? process.env.ADDITIONAL_TRUSTED_ORIGINS.split(',').map((o) => o.trim())
        : []),
    ],
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        // Get the first error from the array
        const firstError = errors[0];
        // Get the first constraint message from that error
        const message = firstError.constraints
          ? Object.values(firstError.constraints)[0]
          : 'Validation failed';
        return new BadRequestException(message);
      },
    }),
  );

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Buy Me a Yard API')
    .setDescription('Unified backend API for Buy Me a Yard creator platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('better-auth.session_token')
    .addTag(
      'payouts',
      'Bank account, withdrawals and payout history. Amounts are in kobo (₦1 = 100). Success responses are wrapped as `{ data, meta }`; errors as `{ error: { code, message } }`. Full guide: docs/PAYOUTS_INTEGRATION.md',
    )
    .addTag(
      'support-tickets',
      'Contact support messages, optionally about a payout or contribution',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logger.log(`🚀 Buy Me a Yard API running at http://localhost:${port}/api/v1`);
  logger.log(
    `📖 API Documentation available at http://localhost:${port}/api/docs`,
  );
}

void bootstrap();
