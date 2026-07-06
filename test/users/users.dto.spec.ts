import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@prisma/client';
import { CreateUserDto } from '../../src/users/dto/create-user.dto';
import {
  ListUsersOrder,
  ListUsersQueryDto,
} from '../../src/users/dto/list-users-query.dto';
import { UpdateUserDto } from '../../src/users/dto/update-user.dto';

describe('Users DTOs', () => {
  it('requires create user fields and validates email', async () => {
    const dto = plainToInstance(CreateUserDto, {
      firstName: '',
      lastName: '',
      email: 'invalid-email',
      password: '123',
      role: 'SUPERADMIN',
    });

    const errors = await validate(dto);
    const propertyNames = errors.map((error) => error.property);

    expect(propertyNames).toEqual(
      expect.arrayContaining([
        'firstName',
        'lastName',
        'email',
        'password',
        'role',
      ]),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'email',
          constraints: {
            isEmail: 'email must be a valid email address',
          },
        }),
        expect.objectContaining({
          property: 'password',
          constraints: {
            minLength: 'password must be at least 8 characters long',
          },
        }),
      ]),
    );
  });

  it('accepts a valid create user payload', async () => {
    const dto = plainToInstance(CreateUserDto, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.test',
      password: 'StrongPass123!',
      role: Role.USER,
      isActive: true,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('blocks role and isActive on the general update DTO', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      firstName: 'Jane',
      role: Role.ADMIN,
      isActive: false,
    });

    const errors = await validate(dto);
    const propertyNames = errors.map((error) => error.property);

    expect(propertyNames).toEqual(expect.arrayContaining(['role', 'isActive']));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'role',
          constraints: {
            isEmpty: 'role is managed by PATCH /api/v1/users/:id/role',
          },
        }),
        expect.objectContaining({
          property: 'isActive',
          constraints: {
            isEmpty: 'isActive is managed by PATCH /api/v1/users/:id/status',
          },
        }),
      ]),
    );
  });

  it('accepts a valid users list query', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {
      page: '2',
      limit: '25',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'example',
      order: 'asc',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
    expect(dto.order).toBe(ListUsersOrder.ASC);
  });

  it('rejects invalid pagination values in users list query', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {
      page: '0',
      limit: '101',
    });

    const errors = await validate(dto);
    const constraints = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(constraints).toEqual(
      expect.arrayContaining([
        'page must be greater than or equal to 1',
        'limit must be less than or equal to 100',
      ]),
    );
  });

  it('rejects invalid order values in users list query', async () => {
    const dto = plainToInstance(ListUsersQueryDto, {
      order: 'sideways',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'order',
          constraints: {
            isEnum: 'order must be one of the following values: asc, desc',
          },
        }),
      ]),
    );
  });
});
