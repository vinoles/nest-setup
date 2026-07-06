import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const REFRESH_TOKEN_PREFIX = 'rt_';

/**
 * Generates an opaque refresh token.
 * Format: rt_<base64url random bytes>
 */
function generateOpaqueToken(): string {
  const randomBytes = crypto.randomBytes(32);
  return REFRESH_TOKEN_PREFIX + randomBytes.toString('base64url');
}

/**
 * Computes a SHA-256 hex digest of the token.
 * Used as a fast, indexed lookup key — not a security primitive.
 * Allows O(1) session lookup without scanning all active sessions.
 */
function computeLookup(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Hashes a plain refresh token using bcrypt.
 * Secondary layer of protection: even if the tokenLookup leaks,
 * an attacker cannot produce a valid token without the bcrypt pre-image.
 */
async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

/**
 * Verifies a plain token against a bcrypt hash.
 */
async function verifyToken(
  token: string,
  hashedToken: string,
): Promise<boolean> {
  return bcrypt.compare(token, hashedToken);
}

type RefreshSessionRecord = {
  id: string;
  userId: number;
  tokenHash: string;
  familyId: string;
  accessTokenJti: string;
  accessTokenExp: number;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
};

type AccessTokenMetadata = {
  accessTokenJti: string;
  accessTokenExp: number;
};

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class RefreshSessionService {
  constructor(private readonly prisma: PrismaService) {}

  private async findSessionByToken(
    plainToken: string,
  ): Promise<RefreshSessionRecord | null> {
    const tokenLookup = computeLookup(plainToken);

    return await this.prisma.refreshSession.findUnique({
      where: { tokenLookup },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        familyId: true,
        accessTokenJti: true,
        accessTokenExp: true,
        expiresAt: true,
        revokedAt: true,
        replacedBy: true,
      },
    });
  }

  /**
   * Creates a new refresh session for a user.
   * - familyId is generated independently (not derived from the token string).
   * - tokenLookup (SHA-256) is stored for O(1) indexed lookups.
   * - Only the bcrypt hash and the SHA-256 lookup are persisted; the plain token is never stored.
   */
  async createSession(
    userId: number,
    expiresAt: Date,
    accessTokenJti: string,
    accessTokenExp: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const plainToken = generateOpaqueToken();
    const tokenHash = await hashToken(plainToken);
    const tokenLookup = computeLookup(plainToken);
    const familyId = crypto.randomUUID();

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash,
        tokenLookup,
        familyId,
        accessTokenJti,
        accessTokenExp,
        expiresAt,
      },
    });

    return { token: plainToken, expiresAt };
  }

  /**
   * Validates a refresh token.
   * 1. O(1) lookup by SHA-256 tokenLookup (unique index — no full-table scan).
   * 2. Checks expiry, revocation, and replacement status.
   * 3. bcrypt secondary verification on the single matched record.
   */
  async validateToken(
    plainToken: string,
  ): Promise<{ sessionId: string; userId: number; familyId: string }> {
    const session = await this.findSessionByToken(plainToken);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (
      session.expiresAt <= new Date() ||
      session.revokedAt !== null ||
      session.replacedBy !== null
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isValid = await verifyToken(plainToken, session.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      sessionId: session.id,
      userId: session.userId,
      familyId: session.familyId,
    };
  }

  /**
   * Rotates a refresh token:
   * 1. O(1) lookup by tokenLookup — scoped to exactly this token, not all active sessions.
   * 2. Reuse detection: if already replaced or revoked, revokes the entire family.
   * 3. bcrypt secondary verification on the single matched record.
   * 4. In a single transaction: creates the new session, then marks the old one as
   *    replaced using the new session's ID (never stores a plain token in the DB).
   */
  async rotateToken(
    oldPlainToken: string,
    expiresAt: Date,
    accessTokenJti: string,
    accessTokenExp: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const tokenLookup = computeLookup(oldPlainToken);

    const oldSession = await this.prisma.refreshSession.findUnique({
      where: { tokenLookup },
    });

    if (!oldSession) {
      throw new ForbiddenException(
        'Refresh token not recognized. Session revoked for security.',
      );
    }

    // Reuse detection: token was already rotated or revoked — revoke the entire family
    if (oldSession.replacedBy !== null || oldSession.revokedAt !== null) {
      await this.prisma.refreshSession.updateMany({
        where: { familyId: oldSession.familyId },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException(
        'Refresh token reuse detected. Session revoked for security.',
      );
    }

    const isValid = await verifyToken(oldPlainToken, oldSession.tokenHash);
    if (!isValid) {
      throw new ForbiddenException(
        'Refresh token reuse detected. Session revoked for security.',
      );
    }

    const newPlainToken = generateOpaqueToken();
    const newTokenHash = await hashToken(newPlainToken);
    const newTokenLookup = computeLookup(newPlainToken);

    // Transaction: create new session → atomically mark old session as replaced iff it is
    // still active. If another request rotated/revoked the same token concurrently, the
    // conditional update affects 0 rows and we revoke the family.
    await this.prisma.$transaction(async (tx) => {
      const newSession = await tx.refreshSession.create({
        data: {
          userId: oldSession.userId,
          tokenHash: newTokenHash,
          tokenLookup: newTokenLookup,
          familyId: oldSession.familyId,
          accessTokenJti,
          accessTokenExp,
          expiresAt,
        },
      });

      const updateResult = await tx.refreshSession.updateMany({
        where: {
          id: oldSession.id,
          replacedBy: null,
          revokedAt: null,
        },
        data: { replacedBy: newSession.id },
      });

      if (updateResult.count !== 1) {
        await tx.refreshSession.updateMany({
          where: { familyId: oldSession.familyId },
          data: { revokedAt: new Date() },
        });

        throw new ForbiddenException(
          'Refresh token reuse detected. Session revoked for security.',
        );
      }
    });

    return { token: newPlainToken, expiresAt };
  }

  /**
   * Revokes a refresh session and returns the access token metadata
   * associated with that refresh session so the caller can blocklist it.
   */
  async revokeSession(plainToken: string): Promise<AccessTokenMetadata> {
    const session = await this.findSessionByToken(plainToken);

    if (!session || session.expiresAt <= new Date() || session.replacedBy !== null) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isValid = await verifyToken(plainToken, session.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.revokedAt !== null) {
      return {
        accessTokenJti: session.accessTokenJti,
        accessTokenExp: session.accessTokenExp,
      };
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return {
      accessTokenJti: session.accessTokenJti,
      accessTokenExp: session.accessTokenExp,
    };
  }

  /**
   * Revokes all refresh sessions for a user.
   */
  async revokeAllUserSessions(userId: number): Promise<number> {
    const result = await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
