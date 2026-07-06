import {
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthGuard } from '../../src/auth/auth.guard';
import { AuthService } from '../../src/auth/auth.service';
import { RefreshSessionService } from '../../src/auth/refresh-session.service';
import { TokenBlocklistService } from '../../src/auth/token-blocklist.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';
import { UsersService } from '../../src/users/users.service';

// ── Shared mock implementations ─────────────────────────────────────────────────────
const mockValidateToken = jest.fn();
const mockRotateToken = jest.fn();
const mockRevokeSession = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// Mock RefreshSessionService before importing the module
jest.mock('../../src/auth/refresh-session.service', () => ({
  RefreshSessionService: class RefreshSessionService {
    createSession = jest.fn().mockResolvedValue({
      token: 'rt_mock-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    validateToken = mockValidateToken;
    rotateToken = mockRotateToken;
    revokeSession = mockRevokeSession;
  },
}));

jest.mock('../../src/users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('../../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {
    readonly refreshSession = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    readonly $transaction = jest.fn().mockImplementation((cb) => cb(this));
  },
}));

@Controller('api/v1/protected-test')
class ProtectedTestController {
  @UseGuards(AuthGuard)
  @Get()
  getProtectedResource(): { ok: boolean } {
    return { ok: true };
  }
}

describe('Auth login + refresh + logout (e2e)', () => {
  let app: INestApplication<App>;
  let redisStore: Map<string, string>;

  const mockUsersService: {
    findOneUserByEmail: jest.Mock;
    findOneUserById: jest.Mock;
  } = {
    findOneUserByEmail: jest.fn(),
    findOneUserById: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.REFRESH_TOKEN_TTL = '7d';

    redisStore = new Map<string, string>();

    const redisMock = {
      set: jest.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
        return 'OK';
      }),
      exists: jest.fn(async (key: string) => Number(redisStore.has(key))),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: process.env.JWT_EXPIRES_IN },
        }),
      ],
      controllers: [AuthController, ProtectedTestController],
      providers: [
        AuthGuard,
        AuthService,
        TokenBlocklistService,
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: UsersService, useValue: mockUsersService },
        RefreshSessionService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    redisStore.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────

  it('returns 200 and both tokens for valid credentials', async () => {
    mockUsersService.findOneUserByEmail.mockResolvedValueOnce(
      buildUser({
        email: 'admin@example.test',
        password: await bcrypt.hash('AdminPass123!', 10),
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@example.test',
        password: 'AdminPass123!',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
    });
    expect(response.body.refresh_token).toMatch(/^rt_/);

    const jwtService = app.get(JwtService);
    const payload = await jwtService.verifyAsync<{
      sub: number;
      email: string;
      jti: string;
    }>(response.body.access_token);

    expect(payload).toMatchObject({
      sub: 1,
      email: 'admin@example.test',
      role: 'ADMIN',
      jti: expect.any(String),
    });
  });

  it('returns 401 for a wrong password', async () => {
    mockUsersService.findOneUserByEmail.mockResolvedValueOnce(
      buildUser({
        password: await bcrypt.hash('CorrectPass123!', 10),
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@example.test',
        password: 'WrongPass123!',
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Invalid credentials');
      });
  });

  it('returns 401 when the user does not exist', async () => {
    mockUsersService.findOneUserByEmail.mockRejectedValueOnce(
      new NotFoundException('User with email missing@example.test not found'),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'missing@example.test',
        password: 'AnyPass123!',
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Invalid credentials');
      });
  });

  it('returns 403 when the user account is inactive', async () => {
    mockUsersService.findOneUserByEmail.mockResolvedValueOnce(
      buildUser({
        email: 'inactive@example.test',
        isActive: false,
        password: await bcrypt.hash('AdminPass123!', 10),
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'inactive@example.test',
        password: 'AdminPass123!',
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('User account is inactive');
      });
  });

  it('returns 400 for an invalid payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'not-an-email',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toEqual(
          expect.arrayContaining([
            'email must be an email',
            'password should not be empty',
          ]),
        );
      });
  });

  // ── REFRESH ────────────────────────────────────────────────────────────────

  it('returns 200 and new tokens for a valid refresh token', async () => {
    mockValidateToken.mockResolvedValueOnce({
      sessionId: 'session-1',
      userId: 1,
      familyId: 'family-1',
    });

    mockUsersService.findOneUserById.mockResolvedValueOnce(
      buildUser({ id: 1, email: 'admin@example.test', role: 'ADMIN' }),
    );

    mockRotateToken.mockResolvedValueOnce({
      token: 'rt_new-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'rt_valid-old-token' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          access_token: expect.any(String),
          refresh_token: expect.any(String),
        });
      });
  });

  it('returns 401 for an invalid refresh token', async () => {
    mockValidateToken.mockRejectedValueOnce(
      new UnauthorizedException('Invalid or expired refresh token'),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'rt_invalid-token' })
      .expect(401);
  });

  it('returns 403 when refreshing for an inactive user', async () => {
    mockValidateToken.mockResolvedValueOnce({
      sessionId: 'session-1',
      userId: 1,
      familyId: 'family-1',
    });

    mockUsersService.findOneUserById.mockResolvedValueOnce(
      buildUser({ id: 1, email: 'inactive@example.test', isActive: false }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'rt_valid-old-token' })
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('User account is inactive');
      });

    expect(mockRotateToken).not.toHaveBeenCalled();
  });

  // ── LOGOUT ──────────────────────────────────────────────────────────

  it('revokes the refresh token and blocks the current access token on logout', async () => {
    const accessToken = await createAccessToken(app, {
      sub: 1,
      email: 'admin@example.test',
      role: 'ADMIN',
      jti: 'logout-success-jti',
    });

    mockUsersService.findOneUserById.mockResolvedValue(buildUser({ id: 1 }));
    mockRevokeSession.mockResolvedValueOnce({
      accessTokenJti: 'logout-success-jti',
      accessTokenExp: Math.floor(Date.now() / 1000) + 900,
    });

    await request(app.getHttpServer())
      .get('/api/v1/protected-test')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'rt_some-token' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ message: 'Session revoked successfully.' });
      });

    expect(mockRevokeSession).toHaveBeenCalledWith('rt_some-token');

    await request(app.getHttpServer())
      .get('/api/v1/protected-test')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('returns 401 on logout for an invalid refresh token', async () => {
    mockUsersService.findOneUserById.mockResolvedValue(buildUser({ id: 1 }));
    mockRevokeSession.mockRejectedValueOnce(
      new UnauthorizedException('Invalid or expired refresh token'),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'rt_invalid-token' })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Invalid or expired refresh token');
      });
  });

  it('returns 400 on logout with a missing refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({})
      .expect(400);
  });
});

type TestUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AccessTokenPayload = {
  sub: number;
  email: string;
  role: string;
  jti: string;
};

function buildUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: 1,
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.test',
    password: 'hashed-password',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

async function createAccessToken(
  app: INestApplication<App>,
  payload: AccessTokenPayload,
): Promise<string> {
  const jwtService = app.get(JwtService);
  return await jwtService.signAsync(payload);
}
