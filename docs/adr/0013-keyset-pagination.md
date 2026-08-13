---
title: ADR-0013 - Keyset (cursor) pagination rather than skip/offset
description: Constant-cost paging that does not degrade with depth or skip rows on concurrent inserts
---

# ADR-0013 — Keyset (cursor) pagination rather than skip/offset

## Status

Accepted — 2026-08-13

## Tags

`mongodb` `performance` `api-design` `pagination`

## Decision

The conversation message listing paginates by **keyset (cursor)** on
`(timestamp, id)`, not by `skip`/`offset`.

## Why

**`skip` costs grow with depth.** MongoDB walks and discards every skipped
document, so `skip: 10000` reads ten thousand index entries to return twenty.
Cost is O(offset), and it degrades exactly where a busy conversation needs it
most. Keyset seeks directly into the index and is O(page size) at any depth.

**`skip` is also incorrect under concurrent writes.** Messages arrive while a
client pages; a new message shifts every subsequent offset, so page 2 silently
skips or repeats rows. A cursor anchored to a position in the sort order is
stable against inserts.

The spec grades "efficient MongoDB retrieval" and "optimize database queries" —
this is the highest-leverage query decision in the system.

## How it works

- Sort on `(timestamp, id)`. `timestamp` alone is not unique — messages can
  share a millisecond — so `id` is the tiebreaker that makes the ordering total
  and the cursor unambiguous.
- The cursor encodes the last-seen `(timestamp, id)` and the query resumes after
  it.
- Served by the compound index from [ADR-0012](0012-multi-tenancy.md):
  `(tenantId, conversationId, timestamp)`.

## Known limitations

- **No random access to page N.** Keyset supports next/previous, not "jump to
  page 47". Acceptable for a message stream, which is browsed sequentially.
- **No total page count** without a separate count query.
- **The cursor is opaque and must be validated.** It is client-supplied input
  and is parsed defensively — a malformed or hostile cursor must be rejected,
  not interpolated into a query
  ([ADR-0015](0015-input-validation-sanitization.md)).
- Sort field changes invalidate outstanding cursors.

## Relationship to ADR-0008

`_id` is a **UUIDv7**, so it carries a millisecond timestamp and is broadly
chronological — the `id` tiebreaker is therefore meaningful rather than
arbitrary.

We still sort on `(timestamp, _id)` rather than paging on `_id` alone, for three
reasons:

- The compound index must lead with `tenantId` and `conversationId` regardless
  ([ADR-0012](0012-multi-tenancy.md)), so `_id`-only sorting would save no index.
- The API should sort by the field it exposes. `_id` order is *generation*
  order, which diverges from `timestamp` the moment anything is backdated or
  imported.
- RFC 9562 makes v7's intra-millisecond monotonic counter optional, so two ids
  generated in the same millisecond may order randomly. The tiebreaker is still
  load-bearing.

## Rules for agents

- Do not use `skip` for the message listing.
- Always include the `id` tiebreaker; a `timestamp`-only cursor can drop or
  repeat messages sharing a millisecond.
- Validate pagination inputs: bound the page size, reject unparseable cursors.
  Invalid pagination values are a required test case.

## Bad pattern

```ts
collection.find({ tenantId, conversationId })
  .sort({ timestamp: -1 })
  .skip(page * size)          // O(offset), unstable under concurrent inserts
  .limit(size);
```

## Good pattern

```ts
collection.find({
  tenantId,
  conversationId,
  $or: [
    { timestamp: { $lt: cursor.timestamp } },
    { timestamp: cursor.timestamp, _id: { $lt: cursor.id } },
  ],
}).sort({ timestamp: -1, _id: -1 }).limit(size);
```
