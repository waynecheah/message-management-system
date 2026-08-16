import { Binary, UUID } from 'mongodb';
import { Message } from '../../domain/message.ts';
import { toBinaryId, toDocument, toStringId, toView } from './message.mapper.ts';

const message = Message.create({
  tenantId: 't1',
  conversationId: 'c1',
  senderId: 's1',
  content: 'hello',
  metadata: { source: 'web' },
});

describe('message mapper', () => {
  it('stores _id as a 16-byte BSON Binary of subtype 4', () => {
    const doc = toDocument(message);
    expect(doc._id).toBeInstanceOf(Binary);
    expect(doc._id.sub_type).toBe(4);
    expect(doc._id.length()).toBe(16);
    expect('id' in doc).toBe(false);
  });

  it('round-trips the canonical id string', () => {
    expect(toStringId(toBinaryId(message.id))).toBe(message.id);
  });

  it('maps a document to a view with id and without tenantId', () => {
    const view = toView(toDocument(message));
    expect(view.id).toBe(message.id);
    expect(view.metadata).toEqual({ source: 'web' });
    expect('tenantId' in view).toBe(false);
  });

  it('never produces an ObjectId', () => {
    expect(toBinaryId(message.id)).toBeInstanceOf(UUID);
  });
});
