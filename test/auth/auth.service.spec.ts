import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/auth/auth.service';
import { UsersLookupService } from '../../src/users/users-lookup.service';
import { RefreshSessionService } from '../../src/auth/refresh-session.service';
import { TokenBlocklistService } from '../../src/auth/token-blocklist.service';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Mock RefreshSessionService to break the PrismaService dependency chain
jest.mock('../../src/auth/refresh-session.service', () => ({
  RefreshSessionService: class RefreshSessionService {
    createSession = jest.fn().mockResolvedValue({
      token: 'rt_mock-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    validateToken = jest.fn();
    rotateToken = jest.fn();
    revokeSession = jest.fn();
  },
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

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersLookupService = {
    findOneUserByEmail: jest.fn(),
    findOneUserById: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    decode: jest.fn(),
  };

  const mockRefreshSessionService = {
    createSession: jest.fn(),
    validateToken: jest.fn(),
    rotateToken: jest.fn(),
    revokeSession: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('7d'),
  };

  const mockTokenBlocklistService = {
    add: jest.fn().mockResolvedValue(undefined),
    isBlocked: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.decode.mockReturnValue({
      jti: 'issued-jti',
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersLookupService, useValue: mockUsersLookupService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RefreshSessionService, useValue: mockRefreshSessionService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenBlocklistService, useValue: mockTokenBlocklistService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signIn', () => {
    it('should return access_token and refresh_token on successful sign in', async () => {
      mockUsersLookupService.findOneUserByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        role: Role.ADMIN,
        isActive: true,
        password: await bcrypt.hash('password', 10),
      });

      mockJwtService.signAsync.mockResolvedValue('fake-jwt-token');
      mockRefreshSessionService.createSession.mockResolvedValue({
        token: 'rt_fake-refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await service.signIn('test@example.com', 'password');

      expect(result).toEqual({
        access_token: 'fake-jwt-token',
        refresh_token: 'rt_fake-refresh-token',
      });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 1,
          email: 'test@example.com',
          role: Role.ADMIN,
          jti: expect.any(String),
        }),
      );
      expect(mockRefreshSessionService.createSession).toHaveBeenCalledWith(
        1,
        expect.any(Date),
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should return unauthorized when user is not found', async () => {
      mockUsersLookupService.findOneUserByEmail.mockRejectedValue(
        new NotFoundException('User with email missing@example.com not found'),
      );

      await expect(
        service.signIn('missing@example.com', 'password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should pass the provided email to the lookup dependency during sign in', async () => {
      mockUsersLookupService.findOneUserByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        role: Role.ADMIN,
        isActive: true,
        password: await bcrypt.hash('password', 10),
      });

      mockJwtService.signAsync.mockResolvedValue('fake-jwt-token');
      mockRefreshSessionService.createSession.mockResolvedValue({
        token: 'rt_fake-refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await service.signIn('  TEST@EXAMPLE.COM  ', 'password');

      expect(mockUsersLookupService.findOneUserByEmail).toHaveBeenCalledWith(
        '  TEST@EXAMPLE.COM  ',
      );
    });

    it('should return unauthorized for wrong password', async () => {
      mockUsersLookupService.findOneUserByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        role: Role.ADMIN,
        isActive: true,
        password: await bcrypt.hash('correct-password', 10),
      });

      await expect(
        service.signIn('test@example.com', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should return forbidden for an inactive user', async () => {
      mockUsersLookupService.findOneUserByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        role: Role.ADMIN,
        isActive: false,
        password: await bcrypt.hash('password', 10),
      });

      await expect(service.signIn('test@example.com', 'password')).rejects.toThrow(
        new ForbiddenException('User account is inactive'),
      );

      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
      expect(mockRefreshSessionService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should return new access_token and refresh_token for valid refresh token', async () => {
      mockRefreshSessionService.validateToken.mockResolvedValue({
        sessionId: 'session-1',
        userId: 1,
        familyId: 'family-1',
      });

      mockUsersLookupService.findOneUserById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        role: Role.ADMIN,
        isActive: true,
      });

      mockJwtService.signAsync.mockResolvedValue('new-jwt-token');
      mockRefreshSessionService.rotateToken.mockResolvedValue({
        token: 'rt_new-refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await service.refresh('rt_valid-old-token');

      expect(result).toEqual({
        access_token: 'new-jwt-token',
        refresh_token: 'rt_new-refresh-token',
      });
      expect(mockRefreshSessionService.rotateToken).toHaveBeenCalledWith(
        'rt_valid-old-token',
        expect.any(Date),
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should throw unauthorized for invalid refresh token', async () => {
      mockRefreshSessionService.validateToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      await expect(service.refresh('rt_invalid-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('should return forbidden for an inactive user during refresh', async () => {
      mockRefreshSessionService.validateToken.mockResolvedValue({
        sessionId: 'session-1',
        userId: 1,
        familyId: 'family-1',
      });

      mockUsersLookupService.findOneUserById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        role: Role.ADMIN,
        isActive: false,
      });

      await expect(service.refresh('rt_valid-old-token')).rejects.toThrow(
        new ForbiddenException('User account is inactive'),
      );

      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
      expect(mockRefreshSessionService.rotateToken).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    const jti = 'test-jti-uuid';
    const exp = Math.floor(Date.now() / 1000) + 900;

    it('should revoke the refresh session and blocklist the access token', async () => {
      mockRefreshSessionService.revokeSession.mockResolvedValue({
        accessTokenJti: jti,
        accessTokenExp: exp,
      });

      await service.logout('rt_some-refresh-token');

      expect(mockRefreshSessionService.revokeSession).toHaveBeenCalledWith(
        'rt_some-refresh-token',
      );
      expect(mockTokenBlocklistService.add).toHaveBeenCalledWith(jti, exp);
    });

    it('should throw unauthorized for an invalid refresh token', async () => {
      mockRefreshSessionService.revokeSession.mockRejectedValue(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      await expect(service.logout('rt_invalid-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(mockTokenBlocklistService.add).not.toHaveBeenCalled();
    });
  });
});
