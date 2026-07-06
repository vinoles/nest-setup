import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const baseEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL: z.string().min(1).default('7d'),
  REDIS_HOST: z
    .string()
    .min(1, 'REDIS_HOST is required')
    .refine((value) => !value.includes(':'), {
      message: 'REDIS_HOST must not include a port separator (:). Use REDIS_PORT instead.',
    }),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
}).superRefine((env, ctx) => {
  const hasDatabaseUrl = Boolean(env.DATABASE_URL);
  const hasTestDatabaseUrl = Boolean(env.TEST_DATABASE_URL);

  if (!hasDatabaseUrl && !(env.NODE_ENV === 'test' && hasTestDatabaseUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DATABASE_URL is required unless NODE_ENV=test and TEST_DATABASE_URL is provided',
      path: ['DATABASE_URL'],
    });
  }
});

export type AppEnv = z.infer<typeof baseEnvSchema>;

export function parseEnv(raw: Record<string, unknown>): AppEnv {
  return baseEnvSchema.parse(raw);
}
