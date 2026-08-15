import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * Runs AFTER ValidationPipe so bounds apply to the raw value the client sent,
 * and so content that sanitizes away to nothing reaches Message.create (spec §1).
 */
@Injectable()
export class SanitizeContentPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): Record<string, unknown> {
    const body = value as Record<string, unknown>;
    if (metadata.type !== 'body' || typeof body?.content !== 'string') return body;
    return {
      ...body,
      content: sanitizeHtml(body.content, { allowedTags: [], allowedAttributes: {} }),
    };
  }
}
