---
title: ADR-0011 - At-least-once delivery with idempotent indexing
description: Duplicates are made harmless rather than prevented, using the message id as the ES document id
---

# ADR-0011 — At-least-once delivery with idempotent indexing

## Status

Accepted — 2026-08-13

## Tags

`kafka` `reliability` `idempotency` `eda`

## Decision

Consumption is **at-least-once**. Duplicate delivery is made harmless rather
than prevented: the Elasticsearch document id **is** the message id, so
re-indexing the same event is an overwrite with identical content.

A publish failure must not be swallowed. Persisting to MongoDB and publishing to
Kafka are separate operations and the gap between them is handled explicitly.

## Why

The spec requires message delivery guarantees. Exactly-once across Kafka and
Elasticsearch is not achievable without either a transactional outbox or
distributed coordination, both of which exceed this timebox.

At-least-once plus idempotent application is the standard, honest answer — and
it is nearly free here, because [ADR-0008](0008-uuid-primary-key.md) gives every
message a domain-generated id before it is ever persisted. That id keys both
stores, so an index operation carries its own deduplication.

## How it works

- Consumer commits offsets **after** the index operation succeeds, not before.
  Crashing mid-batch replays the event; the overwrite makes that a no-op.
- Indexing uses the message id as the document id (`PUT /index/_doc/{id}`), so
  it is naturally an upsert.
- Ordering within a conversation is preserved by the partitioning in
  [ADR-0010](0010-kafka-client-and-topology.md), so a replayed older event
  cannot overwrite a newer one out of order within a partition.

## Known limitations

**The write-then-publish gap is the real weakness.** If the process dies after
the Mongo write and before the Kafka publish, the message exists but is never
indexed — invisible to search, present in the conversation. We accept this and
document it, rather than half-implementing an outbox.

The mitigations we do take: publish failures are logged and surfaced, never
silently discarded; and because the index is derived
([ADR-0009](0009-mongodb-system-of-record.md)), a backfill from MongoDB can
repair it at any time without data loss.

**The proper fix, out of scope:** a transactional outbox — write the message and
the pending event in one Mongo transaction, with a relay publishing from the
outbox collection. Named in the README as a known trade-off.

## Consequences

- Consumers must be written to tolerate re-delivery. Any future consumer that is
  not idempotent breaks this contract.
- Integration tests should assert that consuming the same event twice leaves
  identical state.

## Rules for agents

- Never commit Kafka offsets before the work succeeds.
- Never generate a fresh id at index time — always use the message id.
- Never swallow a publish error.

## Bad pattern

```ts
await es.index({ index, body: doc });      // auto-generated _id → duplicates
await consumer.commitOffsets(...);          // committed regardless of outcome
```

## Good pattern

```ts
await es.index({ index, id: message.id, body: doc });   // upsert by message id
// offsets committed only after this resolves
```
