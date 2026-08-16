import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsNotBlank } from './is-not-blank.validator.ts';

export class SearchMessagesQueryDto {
  @ApiProperty({ maxLength: 256, example: 'quick' })
  @IsString() @IsNotEmpty() @IsNotBlank() @MaxLength(256)
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}
