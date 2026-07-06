import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ListUsersOrder } from '../../src/users/dto/list-users-query.dto';
import { UsersService } from '../../src/users/users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;

  const prisma = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const hashMock = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

  const userRecord = (overrides: Partial<User> = {}): User => ({
    id: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.test',
    password: 'hashed-password',
    role: Role.USER,
    isActive: true,
    createdAt: new Date('2026-04-21T10:00:00.000Z'),
    updatedAt: new Date('2026-04-21T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(prisma);
  });

  it('creates a user with a hashed password and strips password from the response', async () => {
    hashMock.mockResolvedValue('hashed-create-password' as never);
    prisma.user.create = jest
      .fn()
      .mockResolvedValue(userRecord({ password: 'hashed-create-password' }));

    const result = await service.createUser({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'Jane.Doe@Example.Test',
      password: 'StrongPass123!',
      role: Role.ADMIN,
      isActive: false,
    });

    expect(hashMock).toHaveBeenCalledWith('StrongPass123!', 10);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.test',
        password: 'hashed-create-password',
        role: Role.ADMIN,
        isActive: false,
      },
    });
    expect(result).toEqual({
      data: expect.objectContaining({
        id: 1,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.test',
        role: Role.USER,
        isActive: true,
      }),
    });
    expect(result.data).not.toHaveProperty('password');
  });

  it('maps unique email violations to ConflictException', async () => {
    hashMock.mockResolvedValue('hashed-create-password' as never);
    prisma.user.create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.7.0',
      }),
    );

    await expect(
      service.createUser({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.test',
        password: 'StrongPass123!',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists users without exposing passwords', async () => {
    prisma.user.count = jest.fn().mockResolvedValue(2);
    prisma.user.findMany = jest
      .fn()
      .mockResolvedValue([
        userRecord(),
        userRecord({ id: 2, email: 'john.doe@example.test' }),
      ]);

    const result = await service.listUsers({
      page: 1,
      limit: 10,
      order: ListUsersOrder.DESC,
    });

    expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {},
      skip: 0,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty('password');
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      order: ListUsersOrder.DESC,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      next: undefined,
      previous: undefined,
    });
  });

  it('filters users and paginates the result set', async () => {
    prisma.user.count = jest.fn().mockResolvedValue(3);
    prisma.user.findMany = jest.fn().mockResolvedValue([userRecord()]);

    const result = await service.listUsers({
      page: 2,
      limit: 1,
      firstName: 'ja',
      lastName: 'do',
      email: 'example',
      order: ListUsersOrder.ASC,
    });

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            firstName: {
              contains: 'ja',
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: 'do',
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: 'example',
              mode: 'insensitive',
            },
          },
        ],
      },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            firstName: {
              contains: 'ja',
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: 'do',
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: 'example',
              mode: 'insensitive',
            },
          },
        ],
      },
      skip: 1,
      take: 1,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(result.meta).toEqual({
      page: 2,
      limit: 1,
      order: ListUsersOrder.ASC,
      total: 3,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
      next: '/api/v1/users?page=3&limit=1&order=asc&firstName=ja&lastName=do&email=example',
      previous: '/api/v1/users?page=1&limit=1&order=asc&firstName=ja&lastName=do&email=example',
    });
  });

  it('orders users by createdAt ascending when requested', async () => {
    prisma.user.count = jest.fn().mockResolvedValue(1);
    prisma.user.findMany = jest.fn().mockResolvedValue([userRecord()]);

    await service.listUsers({
      page: 1,
      limit: 10,
      order: ListUsersOrder.ASC,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {},
      skip: 0,
      take: 10,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('updates only profile fields and hashes a new password', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(userRecord());
    hashMock.mockResolvedValue('hashed-updated-password' as never);
    prisma.user.update = jest
      .fn()
      .mockResolvedValue(
        userRecord({ firstName: 'Janet', password: 'hashed-updated-password' }),
      );

    const result = await service.updateUserProfile(1, {
      firstName: 'Janet',
      password: 'NewStrongPass123!',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        firstName: 'Janet',
        password: 'hashed-updated-password',
      },
    });
    expect(result.data).toMatchObject({ firstName: 'Janet' });
    expect(result.data).not.toHaveProperty('password');
  });

  it('updates role and status only through dedicated methods', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(userRecord());
    prisma.user.update = jest
      .fn()
      .mockResolvedValueOnce(userRecord({ role: Role.ADMIN }))
      .mockResolvedValueOnce(userRecord({ isActive: false }));

    const roleResult = await service.updateUserRole(1, { role: Role.ADMIN });
    const statusResult = await service.updateUserStatus(1, { isActive: false });

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { role: Role.ADMIN },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 1 },
      data: { isActive: false },
    });
    expect(roleResult.data.role).toBe(Role.ADMIN);
    expect(statusResult.data.isActive).toBe(false);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);

    await expect(service.getUserById(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('wraps unexpected Prisma errors in listUsers as InternalServerErrorException', async () => {
    prisma.user.count = jest.fn().mockRejectedValue(new Error('DB connection lost'));

    await expect(
      service.listUsers({ page: 1, limit: 10, order: ListUsersOrder.DESC }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('wraps unexpected Prisma errors in updateUserProfile as InternalServerErrorException', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(userRecord());
    prisma.user.update = jest.fn().mockRejectedValue(new Error('DB timeout'));

    await expect(
      service.updateUserProfile(1, { firstName: 'Janet' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('wraps unexpected Prisma errors in updateUserRole as InternalServerErrorException', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(userRecord());
    prisma.user.update = jest.fn().mockRejectedValue(new Error('DB timeout'));

    await expect(
      service.updateUserRole(1, { role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('wraps unexpected Prisma errors in updateUserStatus as InternalServerErrorException', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(userRecord());
    prisma.user.update = jest.fn().mockRejectedValue(new Error('DB timeout'));

    await expect(
      service.updateUserStatus(1, { isActive: false }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('re-throws NotFoundException as-is from findUserOrThrow', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);

    await expect(service.getUserById(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
