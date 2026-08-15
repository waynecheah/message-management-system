import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty() senderId!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) timestamp!: Date;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
}
