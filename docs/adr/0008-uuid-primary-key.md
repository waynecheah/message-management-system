---
title: ADR-0008 - UUIDv7 as _id, stored as BSON Binary subtype 4, never ObjectId
description: Time-ordered ids generated in the domain layer, for index write locality without ObjectId
---

# ADR-0008 — UUIDv7 as `_id`, stored as BSON Binary subtype 4, never `ObjectId`

## Status

Accepted — 2026-08-13

## Tags

`mongodb` `identity` `ddd` `performance`

## Decision

`_id` is a **UUID version 7** — time-ordered, with a 48-bit Unix millisecond
timestamp in the high bits. `ObjectId` is banned outright: not imported,
generated, accepted or returned anywhere.

Ids are generated **in the domain layer**, never by the database. The driver
must never auto-assign an `_id`.

Storage form is BSON `UUID` (Binary subtype 4). The API exposes the canonical
string form as `id`.

> **Naming collision, worth reading twice:** "BSON Binary **subtype 4**" and
> "UUID **version 4**" are unrelated. Subtype 4 is BSON's tag meaning "this
> binary blob is a UUID" and applies to any UUID version. We store a **v7** UUID
> in a **subtype 4** binary field. This is correct, and it looks like a typo
> every time.

## Why

**Write locality — the reason for v7 over v4.** A v4 UUID is pure randomness, so
every insert lands at a random point in the `_id` index: scattered B-tree page
splits and poor cache behaviour on an append-heavy workload. v7 sorts by time,
so inserts append at the right edge of the index — the same property that makes
`ObjectId` cheap to write. A message store is almost pure append, so this is on
the hot path, and "efficient MongoDB retrieval" is graded.

**Domain-generated identity is a DDD requirement, not a preference.** An entity
that cannot be fully constructed until the database has seen it is not an
aggregate — it is a database row with aspirations. Generating the id in the
domain means a `Message` is valid and complete before any persistence call, and
can be published to Kafka without a round trip.

**`ObjectId` is a persistence-layer type.** Letting it become the identity type
leaks the driver into the domain and into the API contract, which
[ADR-0005](0005-ddd-layering.md) forbids. v7 recovers `ObjectId`'s time-ordering
without adopting `ObjectId` itself.

**Ids survive the event flow.** With the id fixed at creation, the same value
keys the Mongo document and the Elasticsearch document, which is what makes
idempotent indexing possible — see
[ADR-0011](0011-delivery-guarantees-idempotency.md).

## How it works

**Node's standard library cannot generate v7.** Verified on Node v24.12.0:
`crypto.randomUUID()` returns v4, and it *silently ignores* a `{ version: 7 }`
option rather than throwing — so a wrong assumption here fails quietly.

We therefore hand-roll a small generator in the domain layer rather than adding
a dependency (consistent with [ADR-0003](0003-nub-toolchain.md)'s minimalism,
and with the standing rule against the `uuid` package):

1. 48-bit Unix millisecond timestamp into the first 6 bytes.
2. Random fill for the remainder.
3. Set the version nibble to `7` and the variant bits to `10xx`.

The bit manipulation in step 3 is easy to get subtly wrong, so it carries a unit
test asserting the version nibble and variant bits, plus ordering across
generations. The mapper converts to the driver's BSON `UUID` for storage.

`CONTEXT.md` types `Message.id` as `string`; that contract is unchanged.

## Known limitations

**Binary subtype 4 over a hex string** — 16 bytes rather than 36. The `_id`
index is mandatory and `tenantId` leads the compound indexes
([ADR-0012](0012-multi-tenancy.md)), so the saving is on the hot path. The cost
is that raw `mongosh` output is less readable than a plain string.

**Intra-millisecond ordering is not guaranteed.** RFC 9562 makes the monotonic
counter optional; without one, two v7s generated in the same millisecond order
randomly relative to each other. v7 therefore does *not* remove the need for a
tiebreaker in pagination — see [ADR-0013](0013-keyset-pagination.md).

**v7 leaks creation time** to anyone holding an id. That is a real reason to
avoid v7 for user ids or opaque tokens. It is a non-issue here: `timestamp` is
already in the message payload, so the id discloses nothing new.

**Lower entropy than v4** — 74 random bits rather than 122. Still far beyond
guessable, but worth knowing if an id is ever used as a capability. It must not
be.

**Ordering is only as good as clock sync** across producers. The same caveat
applies to sorting on `timestamp`, so it changes nothing in practice.

## Relationship to ADR-0013

v7 makes `_id` approximately chronological, which is why it is a *meaningful*
tiebreaker rather than an arbitrary one. But pagination still sorts on
`(timestamp, _id)`, not on `_id` alone, because: the compound index must lead
with tenant and conversation regardless (so `_id`-only sorting saves no index);
the API should sort by the field it exposes; and intra-millisecond order is
unguaranteed.

## Rules for agents

- Never import `ObjectId`.
- Never let the driver assign `_id`.
- Never use `crypto.randomUUID()` for `_id` — it emits v4 and ignores a version
  option without complaint. Use the project's v7 generator.
- Never add the `uuid` package.
- Never treat an id as a secret or a capability.
- The mapper is the single place `_id` ↔ `id` translation happens. No other
  layer may reference `_id`.

## Bad pattern

```ts
await collection.insertOne({ conversationId, content });  // driver assigns _id
const id = crypto.randomUUID();                           // v4 — scattered writes
```

## Good pattern

```ts
const message = Message.create({ id: uuidV7(), … });      // domain owns identity
await repo.save(message);
```
