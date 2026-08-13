---
title: ADR-0010 - kafkajs directly rather than @nestjs/microservices, and the topic topology
description: Plain providers over the Nest transport, partitioned by conversation for ordering
---

# ADR-0010 — `kafkajs` directly rather than `@nestjs/microservices`, and the topic topology

## Status

Accepted — 2026-08-13

## Tags

`kafka` `eda` `messaging` `nestjs`

## Decision

Use **`kafkajs` directly**, wrapped in plain Nest providers bound to domain
ports. Do not use `@nestjs/microservices`.

Partition the message-created topic by `conversationId` (or
`tenantId:conversationId`).

## Why

**The Nest Kafka transport is built around request–reply** and controller-bound
`@EventPattern` handlers. That pulls framework decorators into consumer logic
and, more importantly, hides the topic, partition and consumer-group
configuration inside transport options — when "design Kafka topics, partitions,
and consumer groups for scalability and fault tolerance" is an explicitly graded
requirement. A thin provider over `kafkajs` puts that configuration somewhere a
reviewer can read it.

`kafkajs` is the underlying client either way — Nest's transport requires it as
a peer dependency — so this removes a layer rather than adding one.

**Partitioning by `conversationId`** is what buys per-conversation ordering.
Kafka guarantees order within a partition only, so keying on the conversation
means every message in a conversation lands on one partition and is consumed in
order, while different conversations still parallelise across the cluster.
Keying on message id would give perfect distribution and no useful ordering;
keying on tenant would preserve more ordering than needed and hot-spot on the
largest tenant.

## Structure / Flow

```
CreateMessage use case
  → MessageRepository.save()          (Mongo, authoritative)
  → EventPublisher.publish()          (port; kafkajs adapter)
                                       key = conversationId
                                       ↓
                              message-created topic
                                       ↓
              consumer group: search-indexer   →   Elasticsearch
```

## Trade-offs

- **We give up Nest's transport conveniences** — lifecycle wiring, the
  `@EventPattern` decorator, built-in retry semantics. Connection lifecycle,
  graceful shutdown and consumer error handling become our code.
- **Partition count bounds consumer parallelism.** A consumer group cannot have
  more useful members than partitions.
- **A hot conversation is a hot partition.** Ordering and even load distribution
  are in tension; we chose ordering.

## Relationship to other ADRs

- [ADR-0011](0011-delivery-guarantees-idempotency.md) — the delivery semantics
  running over this topology.
- [ADR-0009](0009-mongodb-system-of-record.md) — why the consumer's target is a
  disposable projection.

## Rules for agents

- Never add `@nestjs/microservices`.
- The producer and consumer sit behind domain ports; use cases must not import
  `kafkajs`.
- Topic names, partition counts and consumer group ids live in configuration,
  not scattered string literals.

## Bad pattern

```ts
@EventPattern('message-created')          // transport decorator in a controller
handle(@Payload() data: any) {}
```

## Good pattern

```ts
// domain/ports/event-publisher.port.ts
export interface EventPublisher {
  publish(event: MessageCreated): Promise<void>;
}
// infrastructure/kafka/kafkajs-event-publisher.ts — owns the key and topic
```
