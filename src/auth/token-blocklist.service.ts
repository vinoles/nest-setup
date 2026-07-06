import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class TokenBlocklistService {
  private readonly logger = new Logger(TokenBlocklistService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Adds a JWT to the blocklist until it expires.
   * TTL is computed from the token's `exp` claim so the key auto-evicts.
   */
  async add(jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      try {
        await this.redis.set(`blocklist:${jti}`, '1', 'EX', ttl);
      } catch (error: unknown) {
        this.logger.warn(
          `Redis unavailable while blocklisting access token jti=${jti}. Logout will not immediately invalidate the access token.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Returns true if the JTI has been blocklisted (i.e. the token was logged out).
   */
  async isBlocked(jti: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(`blocklist:${jti}`);
      return exists === 1;
    } catch (error: unknown) {
      this.logger.warn(
        `Redis unavailable while checking access-token blocklist for jti=${jti}. Falling back to fail-open behavior.`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
