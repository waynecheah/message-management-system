---
title: ADR-0001 - Documentation split across CLAUDE.md, CONTEXT.md and ADRs
description: Three documents with distinct jobs - requirements, rules, and rationale
---

# ADR-0001 — Documentation split across CLAUDE.md, CONTEXT.md and ADRs

## Status

Accepted — 2026-08-13

## Tags

`documentation` `process` `agent-guidance`

## Decision

Project documentation is split three ways, each with one job:

- **`CONTEXT.md`** — what we are building. Spec-derived facts, binding domain
  vocabulary, the API contract, the data model. Written in the indicative.
- **`CLAUDE.md`** — how agents must work. Imperative rules only.
- **`docs/adr/`** — why we chose what we chose. One decision per file.

## Why

The inherited `CLAUDE.md` mixed three genres: leftover rules from an unrelated
project (Bun + Hono, a `replay` / `expired` / `available stock` vocabulary that
appears nowhere in this spec), actual working rules, and a full restatement of
the requirements. An agent reading it for rules had to wade through spec detail,
and the stale stack instructions actively contradicted the mandated one.

Splitting by *genre of statement* rather than by topic keeps each file skimmable
and gives every fact exactly one home to be corrected in.

## Structure / Flow

```
CONTEXT.md   facts     "Elasticsearch is a derived read model"
CLAUDE.md    rules     "Never read from Elasticsearch except for search"
docs/adr/    rationale "Why Elasticsearch is not the system of record"
```

A concept may appear in more than one file, but only in that file's voice. This
is deliberate: an agent that reads only `CLAUDE.md` must still be unable to get
tenant scoping or the layering wrong.

## Rules for agents

- Read `CONTEXT.md` before writing code. It defines the binding vocabulary.
- Put new *requirements* in `CONTEXT.md`, new *rules* in `CLAUDE.md`, and new
  *decisions* here. Do not add rationale to `CLAUDE.md`.
- Search these ADRs by keyword before making a decision that one may already
  cover.

## Bad pattern

`CLAUDE.md` growing a "Background" section explaining why Mongo is the primary
store — rationale drifting into the rules file, where nobody maintains it.

## Good pattern

`CLAUDE.md` states the rule in one line and the reader who wants the reasoning
follows the ADR reference.
