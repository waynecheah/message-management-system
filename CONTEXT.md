# CONTEXT — Message Management System

What we are building and the vocabulary to build it in. Source of truth:
`docs/Senior Engineer Code Test 1 1.pdf`. Working rules live in `CLAUDE.md`.

## Overview

RESTful APIs for message management within conversations, built as a senior
engineer code test. Assessed on tech stack fluency, architecture (DDD,
event-driven, multi-tenant), and engineering fundamentals (data structures,
algorithms, SOLID, design patterns).

Timebox is 4–5 hours. Deliverable is a code repository plus a README documenting
architecture decisions.

## Domain vocabulary

Use these terms with these exact meanings in code, tests, and docs.

- **Message** — a single utterance persisted in a conversation. The unit of
  work of this system.
- **Conversation** — the ordered stream of messages sharing a
  `conversationId`. Not a separate stored aggregate; it is identified, not
  created.
- **Sender** — the authenticated principal that created a message, taken from
  the token's `sub` claim. A message can only ever be attributed to its caller:
  there is no way to record a message on behalf of someone else, and no concept
  of a system or bot sender. _Avoid_: author, user, participant.
- **Tenant** — the isolation boundary. Every message belongs to exactly one
  tenant, and no read or write may cross tenants.
- **Message-created event** — the Kafka event published after a message is
  persisted. It is the trigger for indexing, not the record of the message.
- **Search index** — the Elasticsearch representation of messages. A derived
  read model, rebuildable from MongoDB, never the system of record.
- **Primary store** — MongoDB. The single system of record.

### Flagged ambiguities

- "Sender" and "user" were used interchangeably — resolved 2026-08-14: there is
  no **User** in this context. The system owns messages, not identities
  (ADR-0018), so **Sender** is the only term, and it means the authenticated
  caller. A consequence worth stating plainly: **transcript import, system
  messages, and bot-relayed messages are all impossible** by construction, not
  merely unbuilt.

## Tech stack (mandated)

| Concern | Technology |
| --- | --- |
| Runtime | Node.js |
| Framework | NestJS (REST) |
| Primary data store | MongoDB |
| Message broker | Kafka |
| Search | Elasticsearch |
| Language | TypeScript, strict mode |

## API contract

- `POST /api/messages` — create a message.
  - Validate required fields: `conversationId`, `content`.
  - Persist to MongoDB.
  - Publish a message-created event to Kafka.
- `GET /api/conversations/:conversationId/messages` — retrieve messages for a
  conversation. Supports pagination and sorting.
- `GET /api/conversations/:conversationId/messages/search?q=term` — full-text
  search over a conversation's messages via Elasticsearch.

## Data model

```ts
type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
};
```

The public API uses these field names verbatim. Tenant identity is carried
alongside this shape (see Multi-tenancy) and is never client-supplied as the
sole source of truth.

### Indexing requirements

- MongoDB indexes defined for the actual query patterns — at minimum a compound
  index supporting `(tenantId, conversationId, timestamp)` for paginated
  retrieval.
- Explicit Elasticsearch mappings (field types, analyzer) rather than dynamic
  mapping, chosen for search performance and justified in the README.

## Event handling

- Message creation publishes to Kafka.
- A subscriber consumes those events and indexes messages into Elasticsearch.
- Topics, partitions, and consumer groups are designed for scalability and
  fault tolerance. Partitioning by `conversationId` (or
  `tenantId:conversationId`) preserves per-conversation ordering.
- Delivery guarantees are explicit: at-least-once consumption with idempotent
  indexing (Elasticsearch document id = message id). A publish failure must not
  silently lose the event.

## Multi-tenancy

Every message, query, index, and event carries a tenant identifier. Tenant
scoping is enforced at the data-access layer, not left to callers. Absent tenant
context is an error, never a wildcard. Tenant id leads compound MongoDB indexes
and filters every Elasticsearch query.

## Non-functional requirements

**Performance & scalability** — efficient MongoDB retrieval through proper
indexing; optimized queries; caching where justified; deliberate data structure
choices.

**Reliability & security** — message delivery guarantees; validated and
sanitized inputs; basic authentication and authorization.

Authentication is optional in the spec but **in scope for this build**. It is
verify-only: a global guard validates a JWT bearer token issued by an external
identity provider. There is no login endpoint, no user store, and no password
handling. Authorization means tenant isolation — there are no roles.

`tenantId` and `senderId` are taken from the verified token claims (`tid`,
`sub`). Neither is accepted from a header, query parameter, or request body, so
`senderId` is **not** a field on the create-message request.

**Code quality** — SOLID; DDD; unit and integration tests covering key
functionality and edge cases; a comprehensive README with setup instructions and
architecture decisions.

## README (graded deliverable)

Must cover: setup and run instructions, how to run the tests, the API contract,
and architecture decisions — DDD boundaries, Kafka topic/partition/consumer-group
design, delivery guarantees, MongoDB and Elasticsearch indexing strategy,
multi-tenancy approach, and trade-offs deferred due to the timebox.
