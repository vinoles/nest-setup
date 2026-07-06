import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class TokenBlocklistService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Adds a JWT to the blocklist until it expires.
   * TTL is computed from the token's `exp` claim so the key auto-evicts.
   */
  async add(jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redis.set(`blocklist:${jti}`, '1', 'EX', ttl);
    }
  }

  /**
   * Returns true if the JTI has been blocklisted (i.e. the token was logged out).
   */
  async isBlocked(jti: string): Promise<boolean> {
    const exists = await this.redis.exists(`blocklist:${jti}`);
    return exists === 1;
  }
}
