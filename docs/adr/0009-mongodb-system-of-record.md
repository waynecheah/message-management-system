---
title: ADR-0009 - MongoDB is the system of record, Elasticsearch is a derived read model
description: Search is a projection, rebuildable from Mongo, never authoritative
---

# ADR-0009 — MongoDB is the system of record, Elasticsearch is a derived read model

## Status

Accepted — 2026-08-13

## Tags

`mongodb` `elasticsearch` `cqrs` `data-modelling`

## Decision

**MongoDB is the single system of record.** Elasticsearch holds a derived
projection used only for full-text search. It is rebuildable from MongoDB at any
time and is never authoritative.

Concretely: `GET /api/conversations/:conversationId/messages` reads Mongo.
`…/messages/search?q=` reads Elasticsearch. No other read touches Elasticsearch.

## Why

The spec states MongoDB is the primary data store, so this is partly given. The
decision worth recording is the *discipline* that follows from it: because the
index is derived, an indexing failure degrades search but never loses a message,
and the index can be dropped and rebuilt without a migration or a backup
restore.

Treating the search index as authoritative for any read would make Elasticsearch
availability a correctness dependency of the whole system — for a store that has
no transactional guarantees and lags the write by the consumer's latency.

## Structure / Flow

```
POST /api/messages
  → persist to MongoDB          (authoritative, synchronous)
  → publish message-created     (Kafka)
      → consumer indexes into Elasticsearch   (derived, eventual)
```

## Known limitations

**Search results are eventually consistent.** A message is readable through the
conversation endpoint immediately, but appears in search only once the consumer
has indexed it. This is an accepted, documented property, not a bug — and it is
the direct consequence of publishing after the write rather than writing to both
stores in one transaction (which MongoDB and Elasticsearch cannot do together
anyway).

**Integration tests must account for the lag.** Search assertions need to wait
for the index refresh rather than asserting immediately after the POST.

## How it works — client choice

Use `@elastic/elasticsearch` directly behind a domain port. `@nestjs/elasticsearch`
is a thin DI wrapper and saves little, given
[ADR-0006](0006-solid-hard-rule.md) requires a port and adapter regardless.

Mappings are declared **explicitly** (field types, analyzer) rather than relying
on dynamic mapping, and the analyzer choice is justified in the README.

## Rules for agents

- Never read from Elasticsearch for anything but the search endpoint.
- Never treat an Elasticsearch document as the source of truth for a message.
- Never rely on dynamic mapping.

## Relationship to other ADRs

- [ADR-0010](0010-kafka-client-and-topology.md) — the transport between the two
  stores.
- [ADR-0011](0011-delivery-guarantees-idempotency.md) — what happens when
  indexing fails.
