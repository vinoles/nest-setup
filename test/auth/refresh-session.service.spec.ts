import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RefreshSessionService } from '../../src/auth/refresh-session.service';
import { PrismaService } from '../../src/prisma/prisma.service';

// Mock bcrypt to keep unit tests fast — bcrypt is intentionally slow (that's the point),
// but we don't need to prove it hashes correctly here, just that it's called correctly.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('bcrypt-hashed-token'),
  compare: jest.fn(),
}));

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

/** Replicates the same SHA-256 logic used inside the service */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'session-cuid-old',
    userId: 1,
    tokenHash: 'bcrypt-hashed-token',
    tokenLookup: sha256('rt_old-token'),
    familyId: 'family-uuid-123',
    accessTokenJti: 'old-access-jti',
    accessTokenExp: Math.floor(Date.now() / 1000) + 900,
    expiresAt: new Date(Date.now() + 7 * DAY_MS),
    revokedAt: null,
    replacedBy: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RefreshSessionService', () => {
  let service: RefreshSessionService;

  const mockCreate = jest.fn();
  const mockFindUnique = jest.fn();
  const mockUpdate = jest.fn();
  const mockUpdateMany = jest.fn();
  const mockTransaction = jest.fn();

  const mockPrisma = {
    refreshSession: {
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
    $transaction: mockTransaction,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: transaction executes the callback passing mockPrisma as the tx client
    mockTransaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
      cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshSessionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RefreshSessionService>(RefreshSessionService);
  });

  // ── createSession ────────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('persists tokenLookup (SHA-256) and never the plain token', async () => {
      mockCreate.mockResolvedValue(buildSession());

      const { token: plainToken } = await service.createSession(
        1,
        new Date(Date.now() + 7 * DAY_MS),
        'access-jti',
        Math.floor(Date.now() / 1000) + 900,
      );

      const createArgs = mockCreate.mock.calls[0][0].data;

      // tokenLookup must be the SHA-256 of the plain token — never the plain token itself
      expect(createArgs.tokenLookup).toBe(sha256(plainToken));
      expect(createArgs.tokenLookup).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(createArgs.tokenHash).toBe('bcrypt-hashed-token');
      expect(createArgs.accessTokenJti).toBe('access-jti');
      expect(createArgs.accessTokenExp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(Object.keys(createArgs)).not.toContain('token'); // plain token never stored in DB
    });

    it('generates familyId with randomUUID — independent of the token string', async () => {
      mockCreate.mockResolvedValue(buildSession());

      await service.createSession(
        1,
        new Date(Date.now() + 7 * DAY_MS),
        'access-jti',
        Math.floor(Date.now() / 1000) + 900,
      );

      const createArgs = mockCreate.mock.calls[0][0].data;

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(createArgs.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 
      );
      expect(createArgs.accessTokenJti).toBe('access-jti');
    });

    it('returns the plain token to the caller', async () => {
      mockCreate.mockResolvedValue(buildSession());

      const expiresAt = new Date(Date.now() + 7 * DAY_MS);
      const result = await service.createSession(
        1,
        expiresAt,
        'access-jti',
        Math.floor(Date.now() / 1000) + 900,
      );

      expect(result.token).toMatch(/^rt_/);
      expect(result.expiresAt).toBe(expiresAt);
    });
  });

  // ── validateToken ────────────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('returns sessionId, userId and familyId for a valid token', async () => {
      const session = buildSession();
      mockFindUnique.mockResolvedValue(session);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockUpdate.mockResolvedValue(session);

      const result = await service.validateToken('rt_old-token');

      expect(result).toEqual({
        sessionId: session.id,
        userId: session.userId,
        familyId: session.familyId,
      });
    });

    it('looks up by SHA-256 tokenLookup — not by scanning all sessions', async () => {
      const session = buildSession();
      mockFindUnique.mockResolvedValue(session);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockUpdate.mockResolvedValue(session);

      await service.validateToken('rt_old-token');

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenLookup: sha256('rt_old-token') },
        }),
      );
      // findMany must never be called — that was the O(n × bcrypt) bug
      expect(mockPrisma.refreshSession.findUnique).toHaveBeenCalledTimes(1);
    });

    it('throws 401 when token is not found in DB', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.validateToken('rt_unknown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 401 when the session is expired — simulates 8 days of inactivity', async () => {
      // User logged in, never refreshed, came back 8 days later — TTL was 7 days
      const expiredSession = buildSession({
        expiresAt: new Date(Date.now() - 1 * DAY_MS), // expired 1 day ago
      });
      mockFindUnique.mockResolvedValue(expiredSession);

      await expect(service.validateToken('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // bcrypt must NOT be called — we reject before the expensive check
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws 401 when the session is revoked (logout)', async () => {
      const revokedSession = buildSession({ revokedAt: new Date() });
      mockFindUnique.mockResolvedValue(revokedSession);

      await expect(service.validateToken('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws 401 when the session was already rotated (replacedBy is set)', async () => {
      const rotatedSession = buildSession({ replacedBy: 'some-newer-session-id' });
      mockFindUnique.mockResolvedValue(rotatedSession);

      await expect(service.validateToken('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws 401 when bcrypt verification fails (corrupted or tampered token)', async () => {
      mockFindUnique.mockResolvedValue(buildSession());
      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.validateToken('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  // ── rotateToken ──────────────────────────────────────────────────────────────

  describe('rotateToken', () => {
    it('new session receives the fresh expiresAt from caller — this is the rolling TTL', async () => {
      // Scenario: user logged in 3 days ago. They refresh now.
      // AuthService calls getRefreshExpiresAt() which computes Date.now() + 7d.
      // The new token should expire 7 days from NOW, not from login time.

      const loginTime = new Date(Date.now() - 3 * DAY_MS);
      const originalExpiresAt = new Date(loginTime.getTime() + 7 * DAY_MS); // would expire in 4 days
      const freshExpiresAt = new Date(Date.now() + 7 * DAY_MS); // 7 days from NOW

      const oldSession = buildSession({ expiresAt: originalExpiresAt });
      const newSessionId = 'new-session-cuid-fresh';

      mockFindUnique.mockResolvedValue(oldSession);
      mockBcrypt.compare.mockResolvedValue(true as never);
      // Transaction: create returns the new session, update marks old as replaced
      mockCreate.mockResolvedValue({ ...buildSession(), id: newSessionId, expiresAt: freshExpiresAt });
      mockUpdate.mockResolvedValue({});

      await service.rotateToken('rt_old-token', freshExpiresAt, 'fresh-access-jti', 123456);

      // The new session must be created with the fresh expiry (7 days from now, day 10)
      // NOT with the old session's expiry (day 4)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: freshExpiresAt,
            accessTokenJti: 'fresh-access-jti',
            accessTokenExp: 123456,
          }),
        }),
      );
    });

    it('old session replacedBy = new session ID — never the plain token', async () => {
      const oldSession = buildSession();
      const newSessionId = 'new-session-cuid';

      mockFindUnique.mockResolvedValue(oldSession);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockCreate.mockResolvedValue({ ...buildSession(), id: newSessionId });
      mockUpdate.mockResolvedValue({});

      await service.rotateToken(
        'rt_old-token',
        new Date(Date.now() + 7 * DAY_MS),
        'fresh-access-jti',
        123456,
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: oldSession.id },
          data: expect.objectContaining({ replacedBy: newSessionId }),
        }),
      );

      // Must NOT store the plain token in any field
      const updateData = mockUpdate.mock.calls[0][0].data;
      expect(Object.values(updateData).some((v) => String(v).startsWith('rt_'))).toBe(false);
    });

    it('new session inherits the familyId from the old session', async () => {
      const oldSession = buildSession({ familyId: 'family-uuid-123' });

      mockFindUnique.mockResolvedValue(oldSession);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockCreate.mockResolvedValue({ ...buildSession(), id: 'new-id' });
      mockUpdate.mockResolvedValue({});

      await service.rotateToken(
        'rt_old-token',
        new Date(Date.now() + 7 * DAY_MS),
        'fresh-access-jti',
        123456,
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId: 'family-uuid-123' }),
        }),
      );
    });

    it('throws 403 and revokes entire family when token was already rotated (reuse detection)', async () => {
      // This is the attack scenario: someone stole an old refresh token and tries to use it
      // after the legitimate user already rotated it
      const alreadyRotatedSession = buildSession({
        replacedBy: 'some-newer-session-id', // already rotated
        familyId: 'compromised-family',
      });

      mockFindUnique.mockResolvedValue(alreadyRotatedSession);

      await expect(
        service.rotateToken(
          'rt_old-token',
          new Date(Date.now() + 7 * DAY_MS),
          'fresh-access-jti',
          123456,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // The entire family must be revoked to force re-login
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { familyId: 'compromised-family' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws 403 and revokes family when token was explicitly revoked (logout + reuse attempt)', async () => {
      const revokedSession = buildSession({
        revokedAt: new Date(),
        familyId: 'revoked-family',
      });

      mockFindUnique.mockResolvedValue(revokedSession);

      await expect(
        service.rotateToken(
          'rt_old-token',
          new Date(Date.now() + 7 * DAY_MS),
          'fresh-access-jti',
          123456,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { familyId: 'revoked-family' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws 403 when the token is not found at all', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        service.rotateToken(
          'rt_unknown',
          new Date(Date.now() + 7 * DAY_MS),
          'fresh-access-jti',
          123456,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── revokeSession ────────────────────────────────────────────────────────────

  describe('revokeSession', () => {
    it('marks the session as revoked on logout', async () => {
      const session = buildSession();
      mockFindUnique.mockResolvedValue(session);
      mockUpdate.mockResolvedValue({});

      const result = await service.revokeSession('rt_old-token');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: session.id },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result).toEqual({
        accessTokenJti: session.accessTokenJti,
        accessTokenExp: session.accessTokenExp,
      });
    });

    it('is idempotent — no-op when session is already revoked', async () => {
      mockFindUnique.mockResolvedValue(buildSession({ revokedAt: new Date() }));
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.revokeSession('rt_old-token');

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessTokenJti: 'old-access-jti',
        accessTokenExp: expect.any(Number),
      });
    });

    it('throws 401 when token is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(service.revokeSession('rt_unknown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('throws 401 when token hash verification fails', async () => {
      mockFindUnique.mockResolvedValue(buildSession());
      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.revokeSession('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('throws 401 when session is expired', async () => {
      mockFindUnique.mockResolvedValue(
        buildSession({ expiresAt: new Date(Date.now() - DAY_MS) }),
      );

      await expect(service.revokeSession('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('throws 401 when session was already rotated', async () => {
      mockFindUnique.mockResolvedValue(
        buildSession({ replacedBy: 'some-newer-session-id' }),
      );

      await expect(service.revokeSession('rt_old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockBcrypt.compare).not.toHaveBeenCalled();

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
