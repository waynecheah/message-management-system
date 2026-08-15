import type { estypes } from '@elastic/elasticsearch';

/**
 * No `id` property: the document id IS the message id (ADR-0011), so a copy in
 * _source would be a second value nothing keeps in sync.
 * `metadata.enabled: false` stores it without indexing it — client-controlled
 * keys would otherwise grow the cluster-state mapping without bound.
 */
export const MESSAGE_INDEX_MAPPING: estypes.MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    tenantId: { type: 'keyword' },
    conversationId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    timestamp: { type: 'date' },
    content: { type: 'text', analyzer: 'standard' },
    metadata: { type: 'object', enabled: false },
  },
};
