---
title: ADR-0007 - MongoDB native driver, no Mongoose or any ODM
description: A plain mapper keeps persistence concerns out of the domain entity
---

# ADR-0007 — MongoDB native driver, no Mongoose or any ODM

## Status

Accepted — 2026-08-13

## Tags

`mongodb` `persistence` `ddd` `dependencies`

## Decision

Use the official `mongodb` native driver directly. **No Mongoose, no
`@nestjs/mongoose`, no ODM.** The persistence model is a plain mapper between
the domain entity and the stored document.

## Why

Mongoose's `@Schema()` / `@Prop()` decorators on an entity fuse the persistence
model to the domain model — schema changes then force domain changes, which is
exactly what [ADR-0005](0005-ddd-layering.md) exists to prevent. This is the
single most commonly abandoned DDD practice in NestJS projects, and dropping the
ODM removes the temptation entirely rather than relying on discipline.

Since we were writing a mapper for the one aggregate regardless, Mongoose's
remaining value was connection lifecycle and index declaration — neither of
which justifies the coupling. The driver is a Mongoose dependency anyway, so
this removes a layer rather than adding one.

## How it works

- A Nest provider owns the `MongoClient` lifecycle and exposes typed
  `Collection` handles.
- `infrastructure/mongo/` holds the repository implementations of the domain
  ports and the document ↔ entity mappers.
- Indexes are declared explicitly at startup via `createIndexes`.

## Known limitations

- **Nothing declares indexes for you now.** With the ODM gone, index creation is
  our responsibility — hence the explicit startup step. Forgetting it silently
  costs the graded query performance.
- **No built-in schema validation.** Document shape correctness rests on the
  mapper and on the DTO validation at the boundary
  ([ADR-0015](0015-input-validation-sanitization.md)).
- More boilerplate per aggregate. Acceptable at one aggregate; it would need
  revisiting at a dozen.

## Relationship to other ADRs

- [ADR-0008](0008-uuid-primary-key.md) — with the ODM gone, id generation
  becomes explicit, which is what makes UUID `_id` natural.
- [ADR-0005](0005-ddd-layering.md) — this is the concrete removal of the largest
  inward leak.

## Rules for agents

- Never add `mongoose` or `@nestjs/mongoose`.
- No schema decorators anywhere.
- Declare indexes explicitly at startup — the driver will not do it for you.
- Only the mapper may reference document field names; no other layer.

## Bad pattern

```ts
@Schema()
export class Message {            // domain entity married to the ODM
  @Prop({ required: true }) content: string;
}
```

## Good pattern

```ts
// domain/message.entity.ts — plain class, no decorators
// infrastructure/mongo/message.mapper.ts — toDocument() / toDomain()
```
