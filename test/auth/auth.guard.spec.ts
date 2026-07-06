import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AuthGuard } from '../../src/auth/auth.guard';
import { TokenBlocklistService } from '../../src/auth/token-blocklist.service';
import { UsersLookupService } from '../../src/users/users-lookup.service';

const VALID_PAYLOAD = {
  sub: 1,
  email: 'admin@example.test',
  role: Role.ADMIN,
  jti: 'test-jti-uuid',
  exp: Math.floor(Date.now() / 1000) + 900,
};

describe('AuthGuard', () => {
  let guard: AuthGuard;

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockUsersLookupService = {
    findOneUserById: jest.fn(),
  };

  const mockTokenBlocklistService = {
    isBlocked: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTokenBlocklistService.isBlocked.mockResolvedValue(false);
    process.env.JWT_SECRET = 'test-jwt-secret';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersLookupService, useValue: mockUsersLookupService },
        { provide: TokenBlocklistService, useValue: mockTokenBlocklistService },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
  });

  it('attaches the verified payload for an active user', async () => {
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as Record<string, unknown>;

    mockJwtService.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
    mockUsersLookupService.findOneUserById.mockResolvedValue({ id: 1, isActive: true });

    await expect(guard.canActivate(createExecutionContext(request))).resolves.toBe(true);

    expect(request.user).toEqual(VALID_PAYLOAD);
    expect(mockTokenBlocklistService.isBlocked).toHaveBeenCalledWith(VALID_PAYLOAD.jti);
  });

  it('rejects blocklisted tokens with 401', async () => {
    const request = {
      headers: { authorization: 'Bearer logged-out-token' },
    } as Record<string, unknown>;

    mockJwtService.verifyAsync.mockResolvedValue(VALID_PAYLOAD);
    mockTokenBlocklistService.isBlocked.mockResolvedValue(true);

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(mockUsersLookupService.findOneUserById).not.toHaveBeenCalled();
  });

  it('rejects inactive users with a valid JWT', async () => {
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as Record<string, unknown>;

    mockJwtService.verifyAsync.mockResolvedValue({
      ...VALID_PAYLOAD,
      sub: 2,
      email: 'inactive@example.test',
      role: Role.USER,
    });
    mockUsersLookupService.findOneUserById.mockResolvedValue({ id: 2, isActive: false });

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toThrow(
      new ForbiddenException('User account is inactive'),
    );

    expect(request.user).toBeUndefined();
  });

  it('returns unauthorized when the user record no longer exists', async () => {
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as Record<string, unknown>;

    mockJwtService.verifyAsync.mockResolvedValue({
      ...VALID_PAYLOAD,
      sub: 999,
      email: 'missing@example.test',
    });
    mockUsersLookupService.findOneUserById.mockRejectedValue(
      new NotFoundException('User 999 not found'),
    );

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns unauthorized when the token has no jti claim', async () => {
    const request = {
      headers: { authorization: 'Bearer legacy-token' },
    } as Record<string, unknown>;

    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      email: 'admin@example.test',
      role: Role.ADMIN,
      // no jti, no exp
    });

    await expect(guard.canActivate(createExecutionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(mockUsersLookupService.findOneUserById).not.toHaveBeenCalled();
  });
});

function createExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
