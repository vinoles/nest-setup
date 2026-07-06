import { ZodError } from 'zod';
import { parseEnv } from '../../src/config/env.schema';

describe('parseEnv', () => {
  it('applies defaults for optional runtime configuration', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      JWT_SECRET: 'super-secret',
      REDIS_HOST: 'redis',
    });

    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL).toBe('7d');
    expect(env.REDIS_PORT).toBe(6379);
  });

  it('allows TEST_DATABASE_URL when NODE_ENV is test', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgresql://user:pass@localhost:5432/test_db',
      JWT_SECRET: 'super-secret',
      REDIS_HOST: 'redis',
    });

    expect(env.TEST_DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/test_db');
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('rejects missing database configuration outside test mode', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'super-secret',
        REDIS_HOST: 'redis',
      }),
    ).toThrow(ZodError);
  });

  it('rejects REDIS_HOST values that include a port separator', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
        JWT_SECRET: 'super-secret',
        REDIS_HOST: 'redis:',
      }),
    ).toThrow('REDIS_HOST must not include a port separator (:). Use REDIS_PORT instead.');
  });
});
