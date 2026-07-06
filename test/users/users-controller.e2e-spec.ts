import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '@prisma/client';
import { AuthGuard } from '../../src/auth/auth.guard';
import { CreateUserDto } from '../../src/users/dto/create-user.dto';
import { UpdateUserDto } from '../../src/users/dto/update-user.dto';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { RolesGuard } from '../../src/auth/roles.guard';
import { SelfOrAdminGuard } from '../../src/auth/self-or-admin.guard';

describe('Users controller (e2e)', () => {
  let app: INestApplication<App>;

  const mockUsersService: {
    createUser: jest.Mock;
    updateUserProfile: jest.Mock;
  } = {
    createUser: jest.fn(),
    updateUserProfile: jest.fn(),
  };

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  const userResponse = {
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(SelfOrAdminGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/users', () => {
    it('creates a user with a valid payload', async () => {
      const payload: CreateUserDto = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'Jane.Doe@Example.Test',
        password: 'StrongPass123!',
        role: Role.ADMIN,
        isActive: false,
      };

      mockUsersService.createUser.mockResolvedValueOnce(userResponse);

      const response = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send(payload)
        .expect(201);

      expect(response.body).toEqual(userResponse);
      expect(mockUsersService.createUser).toHaveBeenCalledWith(payload);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({})
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toEqual(
            expect.arrayContaining([
              'firstName must be a string',
              'firstName should not be empty',
              'lastName must be a string',
              'lastName should not be empty',
              'email must be a valid email address',
              'password must be a string',
              'password must be at least 8 characters long',
              'password should not be empty',
            ]),
          );
        });
    });

    it('returns 400 when required fields are empty', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toEqual(
            expect.arrayContaining([
              'firstName should not be empty',
              'lastName should not be empty',
              'email must be a valid email address',
              'password should not be empty',
              'password must be at least 8 characters long',
            ]),
          );
        });
    });

    it('returns 400 when fields are invalid or not whitelisted', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'not-an-email',
          password: '123',
          role: 'SUPERADMIN',
          isActive: 'yes',
          unexpectedField: true,
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toEqual(
            expect.arrayContaining([
              'email must be a valid email address',
              'password must be at least 8 characters long',
              'role must be one of the following values: ADMIN, USER',
              'isActive must be a boolean value',
              'property unexpectedField should not exist',
            ]),
          );
        });
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('updates the user profile with a valid payload', async () => {
      const payload: UpdateUserDto = {
        firstName: 'Janet',
        lastName: 'Smith',
        password: 'NewStrongPass123!',
      };

      mockUsersService.updateUserProfile.mockResolvedValueOnce(userResponse);

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/1')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual(userResponse);
      expect(mockUsersService.updateUserProfile).toHaveBeenCalledWith(1, payload);
    });

    it('returns 400 when patch payload has invalid fields', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/1')
        .send({
          firstName: 'Janet',
          password: '123',
          role: Role.ADMIN,
          isActive: 'false',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toEqual(
            expect.arrayContaining([
              'password must be at least 8 characters long',
              'role is managed by PATCH /api/v1/users/:id/role',
              'isActive is managed by PATCH /api/v1/users/:id/status',
            ]),
          );
        });
    });

    it('returns 400 when patch payload contains non-whitelisted fields', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/1')
        .send({
          firstName: 'Janet',
          unknownField: 'nope',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toEqual(
            expect.arrayContaining(['property unknownField should not exist']),
          );
        });
    });
  });
});
