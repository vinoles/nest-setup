import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    example: 'rt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    description: 'Refresh token of the session to revoke',
  })
  @IsNotEmpty()
  @IsString()
  refresh_token: string;
}