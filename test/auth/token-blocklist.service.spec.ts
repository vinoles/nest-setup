import { Test, TestingModule } from '@nestjs/testing';
import { TokenBlocklistService } from '../../src/auth/token-blocklist.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';

describe('TokenBlocklistService', () => {
  let service: TokenBlocklistService;
  let redisMock: { set: jest.Mock; exists: jest.Mock };

  beforeEach(async () => {
    redisMock = { set: jest.fn(), exists: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlocklistService,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<TokenBlocklistService>(TokenBlocklistService);
  });

  describe('add', () => {
    it('should set the key in Redis with the remaining TTL', async () => {
      const jti = 'test-jti';
      const exp = Math.floor(Date.now() / 1000) + 900; // 15 min from now

      await service.add(jti, exp);

      expect(redisMock.set).toHaveBeenCalledWith(
        `blocklist:${jti}`,
        '1',
        'EX',
        expect.any(Number),
      );
      const ttlArg = redisMock.set.mock.calls[0][3] as number;
      expect(ttlArg).toBeGreaterThan(0);
      expect(ttlArg).toBeLessThanOrEqual(900);
    });

    it('should not call Redis if the token is already expired', async () => {
      const jti = 'expired-jti';
      const exp = Math.floor(Date.now() / 1000) - 10; // expired 10s ago

      await service.add(jti, exp);

      expect(redisMock.set).not.toHaveBeenCalled();
    });
  });

  describe('isBlocked', () => {
    it('should return true when the key exists in Redis', async () => {
      redisMock.exists.mockResolvedValue(1);

      const result = await service.isBlocked('blocked-jti');

      expect(result).toBe(true);
      expect(redisMock.exists).toHaveBeenCalledWith('blocklist:blocked-jti');
    });

    it('should return false when the key does not exist in Redis', async () => {
      redisMock.exists.mockResolvedValue(0);

      const result = await service.isBlocked('unknown-jti');

      expect(result).toBe(false);
    });
  });
});
