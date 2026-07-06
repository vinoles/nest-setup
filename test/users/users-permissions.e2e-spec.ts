import { INestApplication } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthGuard } from '../../src/auth/auth.guard';
import { RolesGuard } from '../../src/auth/roles.guard';
import { SelfOrAdminGuard } from '../../src/auth/self-or-admin.guard';
import { TokenBlocklistService } from '../../src/auth/token-blocklist.service';
import { buildBearerToken, configureJwtTestEnv, createTestAccessToken } from '../helpers/auth-test.helper';
import { CreateUserDto } from '../../src/users/dto/create-user.dto';
import { UpdateUserDto } from '../../src/users/dto/update-user.dto';
import { UsersController } from '../../src/users/users.controller';
import { UsersLookupService } from '../../src/users/users-lookup.service';
import { UsersService } from '../../src/users/users.service';

describe('Users permissions (e2e)', () => {
  let app: INestApplication<App>;

  jest.setTimeout(15000);

  const mockUsersService = {
    findOneUserById: jest.fn(),
    listUsers: jest.fn(),
    createUser: jest.fn(),
    getUserById: jest.fn(),
    updateUserProfile: jest.fn(),
    updateUserRole: jest.fn(),
    updateUserStatus: jest.fn(),
  };

  beforeAll(async () => {
    configureJwtTestEnv();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: process.env.JWT_EXPIRES_IN },
        }),
      ],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: UsersLookupService, useValue: mockUsersService },
        { provide: TokenBlocklistService, useValue: { isBlocked: jest.fn().mockResolvedValue(false) } },
        AuthGuard,
        RolesGuard,
        SelfOrAdminGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    mockUsersService.findOneUserById.mockResolvedValue({
      id: 1,
      email: 'admin@example.test',
      role: Role.ADMIN,
      isActive: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows ADMIN to create users', async () => {
    const token = await createTestAccessToken(app, {
      sub: 1,
      email: 'admin@example.test',
      role: Role.ADMIN,
    });

    mockUsersService.createUser.mockResolvedValueOnce(buildUserResponse());

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', buildBearerToken(token))
      .send(validCreatePayload())
      .expect(201);

    expect(mockUsersService.createUser).toHaveBeenCalledTimes(1);
  });

  it('allows ADMIN to list users', async () => {
    const token = await createTestAccessToken(app, {
      sub: 1,
      email: 'admin@example.test',
      role: Role.ADMIN,
    });

    mockUsersService.listUsers.mockResolvedValueOnce({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', buildBearerToken(token))
      .query({
        page: 2,
        limit: 5,
        firstName: 'Jane',
        email: 'example',
        order: 'asc',
      })
      .expect(200);

    expect(mockUsersService.listUsers).toHaveBeenCalledTimes(1);
    expect(mockUsersService.listUsers).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      firstName: 'Jane',
      email: 'example',
      order: 'asc',
    });
  });

  it('allows ADMIN to get a user by id', async () => {
    const token = await createTestAccessToken(app, {
      sub: 1,
      email: 'admin@example.test',
      role: Role.ADMIN,
    });

    mockUsersService.getUserById.mockResolvedValueOnce(buildUserResponse());

    await request(app.getHttpServer())
      .get('/api/v1/users/10')
      .set('Authorization', buildBearerToken(token))
      .expect(200);

    expect(mockUsersService.getUserById).toHaveBeenCalledWith(10);
  });

  it('denies USER from getting another user by id', async () => {
    const token = await createTestAccessToken(app, {
      sub: 2,
      email: 'user@example.test',
      role: Role.USER,
    });

    await request(app.getHttpServer())
      .get('/api/v1/users/10')
      .set('Authorization', buildBearerToken(token))
      .expect(403);

    expect(mockUsersService.getUserById).not.toHaveBeenCalled();
  });

  it('allows a logged in user to get their own profile', async () => {
    const token = await createTestAccessToken(app, {
      sub: 10,
      email: 'user10@example.test',
      role: Role.USER,
    });

    mockUsersService.getUserById.mockResolvedValueOnce(buildUserResponse());

    await request(app.getHttpServer())
      .get('/api/v1/users/profile')
      .set('Authorization', buildBearerToken(token))
      .expect(200);

    expect(mockUsersService.getUserById).toHaveBeenCalledWith(10);
  });

  it('denies USER from creating users', async () => {
    const token = await createTestAccessToken(app, {
      sub: 2,
      email: 'user@example.test',
      role: Role.USER,
    });

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', buildBearerToken(token))
      .send(validCreatePayload())
      .expect(403);

    expect(mockUsersService.createUser).not.toHaveBeenCalled();
  });

  it('denies USER from listing users', async () => {
    const token = await createTestAccessToken(app, {
      sub: 2,
      email: 'user@example.test',
      role: Role.USER,
    });

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', buildBearerToken(token))
      .expect(403);

    expect(mockUsersService.listUsers).not.toHaveBeenCalled();
  });

  it('allows a USER to update their own profile', async () => {
    const token = await createTestAccessToken(app, {
      sub: 10,
      email: 'user10@example.test',
      role: Role.USER,
    });

    const payload: UpdateUserDto = {
      firstName: 'Janet',
      lastName: 'Smith',
      password: 'NewStrongPass123!',
    };

    mockUsersService.updateUserProfile.mockResolvedValueOnce(buildUserResponse());

    await request(app.getHttpServer())
      .patch('/api/v1/users/10')
      .set('Authorization', buildBearerToken(token))
      .send(payload)
      .expect(200);

    expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(10, payload);
  });

  it('denies a USER from updating another profile', async () => {
    const token = await createTestAccessToken(app, {
      sub: 10,
      email: 'user10@example.test',
      role: Role.USER,
    });

    await request(app.getHttpServer())
      .patch('/api/v1/users/11')
      .set('Authorization', buildBearerToken(token))
      .send({ firstName: 'Other' })
      .expect(403);
  });

  it('allows ADMIN to update role and status', async () => {
    const token = await createTestAccessToken(app, {
      sub: 1,
      email: 'admin@example.test',
      role: Role.ADMIN,
    });

    mockUsersService.updateUserRole.mockResolvedValueOnce(buildUserResponse());
    mockUsersService.updateUserStatus.mockResolvedValueOnce(buildUserResponse());

    await request(app.getHttpServer())
      .patch('/api/v1/users/10/role')
      .set('Authorization', buildBearerToken(token))
      .send({ role: Role.USER })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/users/10/status')
      .set('Authorization', buildBearerToken(token))
      .send({ isActive: false })
      .expect(200);
  });

  it('denies USER from updating role and status', async () => {
    const token = await createTestAccessToken(app, {
      sub: 2,
      email: 'user@example.test',
      role: Role.USER,
    });

    await request(app.getHttpServer())
      .patch('/api/v1/users/10/role')
      .set('Authorization', buildBearerToken(token))
      .send({ role: Role.ADMIN })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/api/v1/users/10/status')
      .set('Authorization', buildBearerToken(token))
      .send({ isActive: true })
      .expect(403);
  });
});

function validCreatePayload(): CreateUserDto {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.test',
    password: 'StrongPass123!',
    role: Role.USER,
    isActive: true,
  };
}

function buildUserResponse() {
  return {
    data: {
      id: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.test',
      role: Role.USER,
      isActive: true,
      createdAt: '2026-04-21T10:00:00.000Z',
      updatedAt: '2026-04-21T10:00:00.000Z',
    },
  };
}
