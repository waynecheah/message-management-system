---
title: ADR-0020 - Read ports return a MessageView projection, not the Message entity
description: The entity carries write invariants only; reads return an immutable projection, which is what makes returning Elasticsearch _source directly honest
---

# ADR-0020 — Read ports return a `MessageView` projection, not the `Message` entity

## Status

Accepted — 2026-08-14

## Tags

`ddd` `cqrs` `domain-model` `elasticsearch` `ports`

## Decision

`Message` is a **write-side entity**: private constructor, `static create()`,
identity and timestamp generated at construction, invariants enforced there.

The read ports do not return it. `MessageReader.listByConversation` returns
`Page<MessageView>` and `MessageSearcher.search` returns `MessageView[]`, where
`MessageView` is a plain immutable type with no behaviour. `MessageWriter.save`
is the only port that speaks in entities.

## Why

**`Message.create()` generates identity, so it cannot reconstruct.** Anything
read back already has an id and a timestamp. Returning the entity from a read
port would require a second factory — `Message.restore(props)` — that takes both
as input and skips validation. That is a constructor which trusts its input,
sitting next to one whose entire job is not to, and it is reachable from
anywhere.

**An Elasticsearch hit is not an entity.** [ADR-0009](0009-mongodb-system-of-record.md)
makes the index a *derived* read model, and the search path returns `_source`
directly, so the object may be stale relative to MongoDB. Dressing it as a
`Message` claims a status it does not have. A reviewer reading
`Message.restore(esHit._source)` is entitled to ask what invariant that entity is
protecting; the answer is none.

**It makes the thin domain legible.** [ADR-0016](0016-thin-domain-model.md)
commits to a domain that is thin because there is genuinely little to enforce.
Confining the entity to the write path is what shows that: the one real
invariant — non-blank content — lives exactly where writes happen, and the read
paths do not pretend to re-enforce it.

## Trade-offs

- **Two types where a classical DDD repository would have one.** The usual
  expectation is `repository.findById(): Entity`. A reader of this codebase who
  is looking for that will not find it, which is why this ADR exists.
- **`MessageView` and the `Message` field set can drift.** Nothing couples them;
  adding a field to one and forgetting the other is a silent gap. The response
  DTO tests are what catch it.
- **This is CQRS in shape but not in substance.** There is one write model and
  one read projection over the same data — no separate write store, no
  projection lag on the MongoDB path. Calling it CQRS would oversell it.

## Consequences

- `MessageView` lives in `domain/` because the ports that return it do, and
  `domain/` may import from nothing else ([ADR-0005](0005-ddd-layering.md)).
- The Mongo mapper maps in both directions: entity → document on write,
  document → `MessageView` on read. It remains the only place `_id` ↔ `id`
  translation happens ([ADR-0008](0008-uuid-primary-key.md)).
- The Elasticsearch adapter maps `_source` → `MessageView` with no entity
  construction on the path.
- Fakes for the read ports return `MessageView` and are correspondingly trivial
  to write, which keeps use-case unit tests free of construction ceremony.

## Rules for agents

- Never add `Message.restore()`, `Message.fromDocument()`, or any second public
  factory that accepts an id or a timestamp.
- Never return `Message` from a read port.
- Never give `MessageView` a method. If it needs behaviour, the behaviour belongs
  on the entity and the caller is on the wrong path.

## Bad pattern

```ts
// a constructor that trusts its input, reachable from anywhere
const message = Message.restore(esHit._source);
return messages;                                  // ...as a "domain entity"
```

## Good pattern

```ts
// infrastructure/elasticsearch/es-message-index.ts
const hits = await this.client.search({ /* DSL */ });
return hits.hits.hits.map((h) => toView(h._source));   // MessageView[]
```
