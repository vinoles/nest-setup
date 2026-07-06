import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class AuthDto {
  @ApiProperty({
    example: 'admin@example.test',
    description: 'User email used to authenticate',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'AdminPass123!',
    description: 'Plain text password for the user account',
  })
  @IsNotEmpty()
  password: string;
}
