# tawk-message-management

<!-- Setup, API contract, and architecture decisions are added as the
     implementation lands. See CONTEXT.md for what is being built and
     docs/adr/ for why. -->

## Developer tooling (optional)

Neither tool below is required to build, run, or test this project. They are
local developer aids — skip them entirely and everything still works.

### CodeGraph

Indexes the codebase into a queryable knowledge graph so AI coding agents can
locate and understand code without grepping through files.

- Install: https://github.com/colbymchenry/codegraph#get-started
- This repo is already initialised — `.codegraph/` exists, and its contents are
  gitignored (the database and daemon files are per-machine, not shared).
- Usage: `codegraph explore "<question or symbol names>"`,
  `codegraph node <symbol-or-file>`

### RTK

Filters and compresses CLI output, cutting the token cost of routine development
commands.

- Install: https://github.com/rtk-ai/rtk#installation
- Usage is transparent — commands are rewritten automatically via a Claude Code
  hook. `rtk gain` reports the savings; `rtk proxy <cmd>` runs a command
  unfiltered.
