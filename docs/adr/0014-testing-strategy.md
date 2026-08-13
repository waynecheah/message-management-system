---
title: ADR-0014 - Testing strategy - TDD, mocked ports for units, docker-compose for integration
description: Unit tests run with no infrastructure; integration tests reuse the compose stack rather than Testcontainers
---

# ADR-0014 — Testing strategy: TDD, mocked ports for units, docker-compose for integration

## Status

Accepted — 2026-08-13

## Tags

`testing` `tdd` `infrastructure` `developer-experience`

## Decision

- **TDD is non-negotiable.** Failing test first, confirmed failing, then the
  minimal code to pass it.
- **Unit tests** cover domain and application layers with infrastructure ports
  mocked. They run with nothing else running.
- **Integration tests** cover the endpoints end-to-end via Nest's testing module
  and `supertest`, against the **docker-compose** stack — not Testcontainers.
- Test command is `nub run test` ([ADR-0003](0003-nub-toolchain.md)).

## Why

**Two tiers, because they answer different questions.** Units answer "is the
business logic right", and must be fast enough to run on every save — which they
can be only because [ADR-0006](0006-solid-hard-rule.md) makes every use case
constructible with fakes. Integration tests answer "is it wired up right",
which mocks structurally cannot.

**docker-compose over Testcontainers.** Testcontainers is more rigorous and
self-contained, but it costs meaningful setup time for three services and runs
slower. The compose stack has to exist anyway so a reviewer can start the
system, so reusing it with a test env file is the same infrastructure at zero
marginal cost. In a 4–5 hour timebox that trade favours compose.

**`mongodb-memory-server` was rejected** — it only solves Mongo, leaving Kafka
and Elasticsearch uncovered, so it would not remove the need for real
infrastructure.

## Known limitations

- **Integration tests need the stack running.** They are not hermetic and will
  fail on a clean machine without `docker compose up`. CI must start it.
- **Shared state between runs.** Compose containers persist across test runs, so
  suites must clean up after themselves or namespace their data — Testcontainers
  would have given a fresh instance per run for free.
- **Eventual consistency shows up here.** Search assertions must wait for the
  Elasticsearch refresh rather than asserting immediately after a POST
  ([ADR-0009](0009-mongodb-system-of-record.md)).

## Consequences — required edge cases

The spec asks for edge case coverage. At minimum:

- missing or blank `conversationId` / `content`
- oversized content
- invalid pagination values and malformed cursors
  ([ADR-0013](0013-keyset-pagination.md))
- empty search results
- cross-tenant access attempts ([ADR-0012](0012-multi-tenancy.md))
- duplicate event consumption
  ([ADR-0011](0011-delivery-guarantees-idempotency.md))

## Rules for agents

- Write the failing test first. Run it. Confirm it fails before implementing.
- Run `nub run test` and confirm all tests pass before every commit. Never claim
  work is complete without running it and seeing the output.
- A fake used in tests must honour the same contract as the real adapter — same
  errors, same ordering guarantees, no stricter preconditions
  ([ADR-0006](0006-solid-hard-rule.md), Liskov).
- If a unit test needs Mongo, Kafka or Elasticsearch running, the layering is
  broken — fix the layering, do not start the container.
