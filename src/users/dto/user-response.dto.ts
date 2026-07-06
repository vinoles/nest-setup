import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_ROLES, type UserRole } from '../users-role.constants';

export class UserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'jane.doe@example.test' })
  email: string;

  @ApiProperty({ enum: USER_ROLES, example: 'USER' })
  role: UserRole;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-04-21T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-04-21T10:00:00.000Z' })
  updatedAt: Date;
}

export class UserResponseDto {
  @ApiProperty({ type: () => UserDto })
  data: UserDto;
}

export class UsersListMetaDto {
  @ApiProperty({ example: 1, minimum: 1 })
  page: number;

  @ApiProperty({ example: 10, minimum: 1 })
  limit: number;

  @ApiProperty({ example: 'desc', enum: ['asc', 'desc'] })
  order: 'asc' | 'desc';

  @ApiProperty({ example: 42, minimum: 0 })
  total: number;

  @ApiProperty({ example: 5, minimum: 0 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNext: boolean;

  @ApiProperty({ example: false })
  hasPrevious: boolean;

  @ApiPropertyOptional({
    example: '/api/v1/users?page=2&limit=10',
  })
  next?: string;

  @ApiPropertyOptional({
    example: '/api/v1/users?page=1&limit=10',
  })
  previous?: string;
}

export class UsersListResponseDto {
  @ApiProperty({ type: () => [UserDto] })
  data: UserDto[];

  @ApiProperty({ type: () => UsersListMetaDto })
  meta: UsersListMetaDto;
}
