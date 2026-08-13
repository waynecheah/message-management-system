---
title: ADR-0002 - Node.js as the runtime, not Bun
description: The spec mandates Node.js; Bun is technically viable but rules out on brief and toolchain
---

# ADR-0002 — Node.js as the runtime, not Bun

## Status

Accepted — 2026-08-13

## Tags

`runtime` `stack` `spec-compliance`

## Decision

The application runs on **Node.js**. Bun is not used as the runtime, the package
manager, or the test runner.

## Why

Two independent reasons, either of which is sufficient:

1. **The spec mandates it.** "Node.js" is the first item in the tech stack of
   `docs/Senior Engineer Code Test 1 1.pdf`. Silently substituting a mandated
   runtime on a code test reads as not following the brief.
2. **The toolchain assumes it.** `nub` (see [ADR-0003](0003-nub-toolchain.md))
   runs on Node, and its rule set bans `bun` as a runner.

## Trade-offs

Bun would have been *technically* workable. The dependency set is friendly to it
— `mongodb`, `kafkajs` and `@elastic/elasticsearch` are pure JS with no native
binding problems. The one Nest-specific hazard is `emitDecoratorMetadata`, which
Nest's DI needs in order to emit `design:paramtypes` for constructor injection;
Bun's transpiler was historically slow to support it, and the standard
workaround is to compile with `tsc` and run the emitted JavaScript on Bun.

What we give up is raw runtime throughput — which, as with
[ADR-0004](0004-express-http-platform.md), is not what this test grades. The
developer-experience wins usually attributed to Bun (direct TypeScript
execution, fast installs) are already provided by `nub`.

## Rules for agents

- Do not introduce `bun`, `bunx`, or `bun test` in any form.
- Do not add code paths conditional on the runtime.
