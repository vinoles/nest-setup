import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'rt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    description: 'Opaque refresh token issued at login or previous refresh',
  })
  @IsNotEmpty()
  @IsString()
  refresh_token: string;
}