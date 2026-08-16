import { ApiProperty } from '@nestjs/swagger';
import { MessageResponseDto } from './message-response.dto.ts';

export class PageResponseDto {
  @ApiProperty({ type: [MessageResponseDto] }) items!: MessageResponseDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
