import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString({ message: 'firstName must be a string' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString({ message: 'lastName must be a string' })
  lastName?: string;

  @ApiPropertyOptional({ example: 'NewStrongPass123!' })
  @IsOptional()
  @IsString({ message: 'password must be a string' })
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  password?: string;

  @ApiHideProperty()
  @IsEmpty({
    message: 'role is managed by PATCH /api/v1/users/:id/role',
  })
  role?: never;

  @ApiHideProperty()
  @IsEmpty({
    message: 'isActive is managed by PATCH /api/v1/users/:id/status',
  })
  isActive?: never;
}
