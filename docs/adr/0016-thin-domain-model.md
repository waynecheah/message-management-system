---
title: ADR-0016 - Keep the domain model honestly thin
description: Message has few real invariants; inventing aggregate ceremony reads as poor judgment, not strong DDD
---

# ADR-0016 — Keep the domain model honestly thin

## Status

Accepted — 2026-08-13

## Tags

`ddd` `domain-model` `scope` `judgment`

## Decision

Keep the layering strict and the domain model **honestly thin**. Do not
manufacture domain complexity to demonstrate DDD.

`Message` has few genuine invariants — non-empty content, tenant and
conversation identity, an immutable timestamp, an id fixed at creation. That is
the whole aggregate. `Conversation` is **identified, not created**: it is the
stream of messages sharing a `conversationId`, not a separate stored aggregate.

## Why

DDD's value is in the *boundaries*, not in the volume of domain objects. The
spec grades DDD adherence, and the boundaries — inward dependencies, ports,
mappers, domain-generated identity — are where that is demonstrated.

A reviewer who finds a `MessageContent` value object wrapping a validated
string, a `ConversationAggregate` with no invariants to protect, and three
domain events for a single write reads **invented ceremony**, not mastery. It
signals an engineer who applies patterns by reflex rather than by need — the
opposite of the seniority being assessed.

There is also a real cost: every speculative abstraction is code to write, test
and defend inside a 4–5 hour budget that
[ADR-0013](0013-keyset-pagination.md) and
[ADR-0012](0012-multi-tenancy.md) have better uses for.

## Trade-offs

**This is in tension with looking impressive, and that tension is deliberate.**
A thin domain can be mistaken for an anemic one, so the distinction has to be
visible: an anemic model has logic that *belongs* in the entity sitting in a
service instead. Ours has little logic because there is little to have — and
what exists (validity at construction, immutability) lives in the entity.

The README states this explicitly, so the thinness reads as a decision rather
than an omission.

## Relationship to other ADRs

- [ADR-0005](0005-ddd-layering.md) — the boundaries are strict *because* the
  domain is thin; the layering is what carries the DDD weight.
- [ADR-0015](0015-input-validation-sanitization.md) — boundary validation is why
  entities need not re-check shape and type.

## Rules for agents

- No value object unless it protects an invariant a primitive cannot.
- No aggregate without invariants to enforce.
- No domain event that nothing consumes.
- Do not create a `Conversation` aggregate or collection. Conversations are
  identified by id, not stored.
- If asked to "make it more DDD", push back and cite this ADR.

## Bad pattern

```ts
class ConversationId { constructor(private readonly value: string) {} }
class MessageContent { … }
class ConversationAggregate { /* no invariants */ }
```

## Good pattern

```ts
class Message {
  private constructor(/* … */) {}
  static create(props: CreateMessageProps): Message {
    // enforces only what is genuinely invariant
  }
}
```
