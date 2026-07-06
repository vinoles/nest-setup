import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiYWRtaW5Admlub2xlcy50ZXN0IiwiaWF0IjoxNzEwMDAwMDAwLCJleHAiOjE3MTAwMDM2MDB9.signature',
    description: 'JWT access token for authenticated requests',
  })
  access_token: string;

  @ApiProperty({
    example: 'rt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    description: 'Opaque refresh token for session renewal',
  })
  refresh_token: string;
}