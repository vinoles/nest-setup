import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, type UserRole } from '../users-role.constants';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString({ message: 'firstName must be a string' })
  @IsNotEmpty({ message: 'firstName should not be empty' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString({ message: 'lastName must be a string' })
  @IsNotEmpty({ message: 'lastName should not be empty' })
  lastName: string;

  @ApiProperty({ example: 'jane.doe@example.test' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password should not be empty' })
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  password: string;

  @ApiPropertyOptional({ enum: USER_ROLES, default: 'USER' })
  @IsOptional()
  @IsEnum(USER_ROLES, {
    message: 'role must be one of the following values: ADMIN, USER',
  })
  role?: UserRole;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;
}
