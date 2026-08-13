---
title: ADR-0003 - nub as the sole Node.js toolkit
description: One package manager and runner; npm, pnpm, yarn and bun are banned
---

# ADR-0003 — `nub` as the sole Node.js toolkit

## Status

Accepted — 2026-08-13

## Tags

`toolchain` `package-manager` `developer-experience`

## Decision

**`nub` is the only package manager and script runner.** `npm`, `pnpm`, `yarn`,
`npx` and `bun` must not be invoked anywhere — not in commands, `package.json`
scripts, the README, or CI.

Verified against `nub` v0.6.0.

## Why

Project convention, set by the repository owner. Mixing package managers
produces competing lockfiles, divergent dependency resolution between machines,
and install state that depends on which tool ran last. A single tool makes the
lockfile authoritative.

`nub` also removes the need for a separate TypeScript execution step — it runs
`.ts` files directly — which keeps the scripts simple.

## How it works

| Task | Command |
| --- | --- |
| Scaffold | `nub init` |
| Install from lockfile | `nub install` (`nub ci` for clean/strict) |
| Add / remove a dependency | `nub add <pkg>` / `nub remove <pkg>` |
| Run a `package.json` script | `nub run <script>` |
| Run the test suite | `nub run test` |
| Run the linter | `nub run lint` |
| Run a local binary | `nub exec <bin>` (alias `nub nubx`) |
| Fetch-and-run a package bin | `nub dlx <pkg>` |
| Run a file directly | `nub <file>` — TypeScript needs no build step |

There is **no `nub test` subcommand**. Tests run through the `package.json`
script: `nub run test`.

## Key constraints

- Third-party documentation and generated scaffolding will assume `npm`. Every
  such command must be translated on the way in.
- `nest new` and similar scaffolders may emit npm-flavoured scripts; these have
  to be corrected rather than accepted as generated.

## Rules for agents

- Commit `nub`'s lockfile. Never commit `package-lock.json`, `pnpm-lock.yaml`
  or `yarn.lock` — delete them if they appear.
- `package.json` scripts must not shell out to another package manager
  internally.
- README setup instructions use `nub` commands only.

## Bad pattern

```jsonc
// package.json
"scripts": { "test": "npm run build && jest" }   // shells out to npm
```

## Good pattern

```jsonc
"scripts": { "test": "jest" }                    // invoked as: nub run test
```
