import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1).optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  COOKIE_SECURE: booleanish.default(false),
  COOKIE_DOMAIN: z.string().optional(),
  // `lax` works whenever the web app and the API share a registrable domain
  // (including localhost:3000 -> localhost:4000). Hosting them on unrelated
  // domains makes the request cross-site, which needs `none` + COOKIE_SECURE.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  SEED_DEFAULT_PASSWORD: z.string().min(8).default('Juma@12345'),

  // Supabase Storage for field photos. Optional: without it the field app still
  // records visits and keeps photos queued on the phone until storage is set up.
  SUPABASE_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('juma-files'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.`);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
