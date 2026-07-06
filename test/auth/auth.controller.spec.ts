import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { RefreshSessionService } from '../../src/auth/refresh-session.service';
import { UsersService } from '../../src/users/users.service';

// Mock RefreshSessionService to break the PrismaService dependency chain
jest.mock('../../src/auth/refresh-session.service', () => ({
  RefreshSessionService: class RefreshSessionService {
    createSession = jest.fn();
    validateToken = jest.fn();
    rotateToken = jest.fn();
    revokeSession = jest.fn();
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

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    signIn: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        RefreshSessionService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
