import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum ListUsersOrder {
  ASC = 'asc',
  DESC = 'desc',
}

function normalizeOptionalString() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  });
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ type: Number, example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be greater than or equal to 1' })
  page = 1;

  @ApiPropertyOptional({ type: Number, example: 10, minimum: 1, default: 10 })
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be greater than or equal to 1' })
  @Max(100, { message: 'limit must be less than or equal to 100' })
  limit = 10;

  @ApiPropertyOptional({ type: String, example: '' })
  @normalizeOptionalString()
  @IsOptional()
  @IsString({ message: 'firstName must be a string' })
  firstName?: string;

  @ApiPropertyOptional({ type: String, example: '' })
  @normalizeOptionalString()
  @IsOptional()
  @IsString({ message: 'lastName must be a string' })
  lastName?: string;

  @ApiPropertyOptional({ type: String, example: '' })
  @normalizeOptionalString()
  @IsOptional()
  @IsString({ message: 'email must be a string' })
  email?: string;

  @ApiPropertyOptional({
    enum: ListUsersOrder,
    example: ListUsersOrder.DESC,
    default: ListUsersOrder.DESC,
    description: 'Order users by createdAt',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    return value.trim().toLowerCase();
  })
  @IsOptional()
  @IsEnum(ListUsersOrder, {
    message: 'order must be one of the following values: asc, desc',
  })
  order: ListUsersOrder = ListUsersOrder.DESC;
}
