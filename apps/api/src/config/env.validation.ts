import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_URL: z.string().url().default('http://localhost:3000'),
  APP_URL: z.string().url().default('http://localhost:3001'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .default('redis://localhost:6379'),

  BETTER_AUTH_SECRET: z
    .string()
    .min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  PAYSTACK_SECRET_KEY: z.string().default('sk_test_mock'),
  PAYSTACK_PUBLIC_KEY: z.string().default('pk_test_mock'),
  PAYSTACK_WEBHOOK_SECRET: z.string().default('webhook_secret_mock'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  PLATFORM_FEE_PERCENTAGE: z.coerce.number().min(0).max(100).default(10),
  DEFAULT_CURRENCY: z.string().default('NGN'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Config validation error: ${JSON.stringify(parsed.error.format(), null, 2)}`,
    );
  }
  return parsed.data;
}
