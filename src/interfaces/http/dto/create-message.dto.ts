import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNotBlank } from './is-not-blank.validator.ts';
import { MaxJsonBytes } from './max-json-bytes.validator.ts';

export class CreateMessageDto {
  @ApiProperty({ maxLength: 128, example: 'conv-42' })
  @IsString() @IsNotEmpty() @IsNotBlank() @MaxLength(128)
  conversationId!: string;

  @ApiProperty({ maxLength: 4000, example: 'hello there' })
  @IsString() @IsNotEmpty() @MaxLength(4000)
  content!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional() @IsObject() @MaxJsonBytes(4096)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
}
