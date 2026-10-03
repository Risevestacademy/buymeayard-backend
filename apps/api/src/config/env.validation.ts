import { z } from 'zod';

export const KYC_CHECKS = [
  'ID_VERIFICATION',
  'LIVENESS',
  'FACE_MATCH',
] as const;
export type KycCheck = (typeof KYC_CHECKS)[number];
const KYC_CHECKS_LIST = KYC_CHECKS.join(', ');

export function parseKycChecks(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_URL: z.string().url().default('http://localhost:3000'),

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

  BREVO_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('BuyMeAYard <buymeayard@gmail.com>'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().optional(),

  PLATFORM_FEE_PERCENTAGE: z.coerce.number().min(0).max(100).default(10),
  DEFAULT_CURRENCY: z.string().default('NGN'),

  CREATOR_FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  // KYC (Didit)
  DIDIT_API_KEY: z.string().optional(),
  DIDIT_WORKFLOW_ID: z.string().optional(),
  DIDIT_WEBHOOK_SECRET: z.string().optional(),
  DIDIT_BASE_URL: z.string().url().default('https://verification.didit.me'),
  KYC_MOBILE_CALLBACK_URL: z.string().default('buymeayard://kyc/complete'),
  KYC_MAX_SESSIONS_PER_DAY: z.coerce.number().int().min(1).default(5),
  // Checks that must each be individually Approved before a provider
  // "Approved" is accepted; otherwise the case goes to admin review.
  KYC_REQUIRED_CHECKS: z
    .string()
    .default('ID_VERIFICATION,LIVENESS,FACE_MATCH')
    .refine(
      (value) => {
        const checks = parseKycChecks(value);
        return (
          checks.length > 0 &&
          checks.every((v) => KYC_CHECKS.includes(v as KycCheck))
        );
      },
      {
        message: `must be a non-empty, comma-separated subset of ${KYC_CHECKS_LIST}`,
      },
    ),
});

// Checked against the raw environment, so variables with a development
// default (e.g. CREATOR_FRONTEND_URL -> localhost) must still be set
// explicitly in production.
const PRODUCTION_REQUIRED_KEYS = [
  'DIDIT_API_KEY',
  'DIDIT_WORKFLOW_ID',
  'DIDIT_WEBHOOK_SECRET',
  'CREATOR_FRONTEND_URL',
] as const;

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Config validation error: ${JSON.stringify(parsed.error.format(), null, 2)}`,
    );
  }

  if (parsed.data.NODE_ENV === 'production') {
    const missing = PRODUCTION_REQUIRED_KEYS.filter((key) => !config[key]);
    if (missing.length > 0) {
      throw new Error(
        `Config validation error: missing required production variables: ${missing.join(', ')}`,
      );
    }
  }

  return parsed.data;
}
