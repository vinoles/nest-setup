import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { USER_ROLES, type UserRole } from '../users-role.constants';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: USER_ROLES, example: 'ADMIN' })
  @IsEnum(USER_ROLES, {
    message: 'role must be one of the following values: ADMIN, USER',
  })
  role: UserRole;
}
