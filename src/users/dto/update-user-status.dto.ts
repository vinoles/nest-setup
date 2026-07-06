import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive: boolean;
}
