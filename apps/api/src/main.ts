import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for webhook cryptographic signature verification
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const appUrl =
    configService.get<string>('APP_URL') || 'http://localhost:3001';

  // Global prefix: /api/v1
  app.setGlobalPrefix('api/v1', {
    exclude: ['webhooks/(.*)', 'health'],
  });

  // Cookies & Security
  app.use(cookieParser());
  app.enableCors({
    origin: [appUrl, 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Buy Me a Yard API')
    .setDescription('Unified backend API for Buy Me a Yard creator platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('better-auth.session_token')
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
