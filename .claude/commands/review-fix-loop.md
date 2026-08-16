---
name: "Review Fix Loop"
description: Iterate Codex code review (code-review-to-github) and Claude fixes (code-review-workflow) against an open GitHub PR until Codex reports no findings, then report round count, P1/P2/P3-by-axis totals, and elapsed time
category: GitHub
tags: [github, code-review, pr, codex, loop, workflow]
---

# Review Fix Loop

Orchestrates two existing skills into a repeat-until-clean cycle: `code-review-to-github`
(`.agents/skills/code-review-to-github/SKILL.md` — Codex CLI reviews, local-only) and `code-review-workflow:respond`
(`.claude/commands/code-review-workflow/respond.md` — Claude fixes and resolves). Runs entirely in the current
session — no `/loop` scheduling. `codex exec` runs as a backgrounded shell command; its exit notification is what
drives the next step.

**This skill does every GitHub read and write for both halves.** `code-review-to-github` cannot talk to GitHub
at all — confirmed by direct test, `curl`/`gh` from inside Codex's `-s workspace-write` sandbox fails instantly
("Could not resolve host", 0ms — a hard sandbox network block, not flaky DNS, not a credential problem, not
fixable by retrying). So this skill fetches PR context *before* each round (for Codex to read) and publishes
Codex's finished review *after* each round (once Codex has written it to a file) — all via `gh`, run from this
skill's own shell, which is not sandboxed and has worked reliably all session.

**GitHub is the only source of truth for findings, once published.** `codex exec`'s stdout/stderr (redirected to
a log file so the background task has somewhere to write) may be inspected to diagnose *why* a round failed, and
nothing else — never to extract a finding's title, file, or fix and act on it. Codex's actual output is the
`output_file` payload (see step 3b) or nothing; the log is not a second channel for findings.

## Authentication

**Two identities, and which one applies depends on which side of the review you're on — reviewer or author.**
Confusing them defeats the point of a separate reviewer account: a reply or a resolve posted as the reviewer
reads as the reviewer talking to themselves instead of the author responding to feedback.

- **Reviewer actions — fetching PR context (steps 1, 3a) and publishing the review itself (step 3c)** — run
  under the **separate reviewer account** (`alvincheah88`), read via a Personal Access Token file, not the PR
  author's identity, and not the Codex GitHub connector (unreliable — see history below).
- **Author actions — replying to threads, resolving them, pushing fix commits (all inside step 3f, delegated to
  `code-review-workflow:respond`)** — run under the **default `gh` identity** (`waynecheah`, whatever `gh auth
  status` reports with no `GH_TOKEN` override). `code-review-workflow:respond` already does this correctly on
  its own and needs no `GH_TOKEN` prefix added to it — don't add one. This split was violated once already,
  manually, outside this skill's own commands: a reply and a resolve got posted as `alvincheah88` by copying the
  `GH_TOKEN` prefix into steps that should never have had it, then had to be deleted and redone as `waynecheah`.
  If you're about to type `GH_TOKEN=$(cat ~/.config/gh-review/token)` before a `gh` command, first check which
  list above that command belongs to.

```bash
GH_TOKEN=$(cat ~/.config/gh-review/token) rtk gh auth status
```

Should report `Logged in to github.com account alvincheah88 (GH_TOKEN)`. If it fails, stop and tell the user —
the token file is missing or the token's expired/revoked; don't fall back to the default `gh` identity.

**`export` does not carry across tool calls, and the env-var assignment goes *before* `rtk`, not after.** Every
individual `gh`/`gh api` call in this skill needs its own `GH_TOKEN=$(cat ~/.config/gh-review/token)` prefix,
placed before `rtk` — `GH_TOKEN=... rtk gh ...` is correct; `rtk env GH_TOKEN=... gh ...` silently drops the
variable (`env` is not a real `rtk` subcommand) and falls through to the default identity. See
`code-review-to-github/SKILL.md`'s Network section for the fuller history of how this was found (Keychain-backed
`gh auth login` doesn't survive Codex's sandbox either — this file-based token is the only kind that works there
at all, though as of this version Codex never runs `gh` directly regardless).

## Inputs

- `repo`: optional `owner/name`; default `waynecheah/message-management-system`.
- `pr_number`: required. The PR must already be open — this skill does not create one. Run `pr-workflow:create` first if it
  doesn't exist yet.
- `max_rounds`: optional, default `10`. Stop and report as incomplete if exceeded without reaching zero findings.
- `model`: optional, default `gpt-5.6-luna`. Passed to `codex exec -m <model>` for every review round.
- `codex_retries`: optional, default `3`. Per-round cap on `codex exec` attempts when it exits without writing a
  valid `output_file`. Exhausting this stops the whole loop (see step 5) — it does not skip the round.

## Trigger

Invoke as `/review-fix-loop <args>` (run manually — this is not auto-invoked from skill matching). Parse `args`
positionally, left to right, all but the first optional: `<pr_number> [max_rounds] [model]`. `repo` and
`codex_retries` have no positional slot — pass them in natural language if they aren't the default.

- `/review-fix-loop 1` — PR 1, default `max_rounds` (10) and `model` (gpt-5.6-luna).
- `/review-fix-loop 1 5` — PR 1, cap at 5 rounds.
- `/review-fix-loop 1 5 gpt-5.6-sol` — PR 1, cap at 5 rounds, model `gpt-5.6-sol`.
- Natural language also works, e.g. "run the review-fix loop on PR 1 with gpt-5.6-sol".

## Workflow

1. **Validate** the PR is open: `GH_TOKEN=$(cat ~/.config/gh-review/token) rtk gh pr view <pr_number> --repo <repo>
   --json state,baseRefName,headRefOid,url`. Stop if not open.
2. **Set up round 0**: `merge_base = git merge-base origin/<baseRefName> HEAD`. Record `start_time`. Set `last_reviewed =
   merge_base`, `round = 1`, and zero the finding tally.
3. **Loop** while `round <= max_rounds`:
   a. `range_to = git rev-parse HEAD`. Fetch this round's PR context and write it where `code-review-to-github`
      expects it (`context_file`, default `/tmp/code-review-to-github-context-<pr_number>.json`):
      - PR state: the same `gh pr view --json state,baseRefName,headRefOid,url` as step 1, re-run fresh (state can
        change between rounds — closed mid-loop, base branch retargeted, etc).
      - Conversation comments: `GH_TOKEN=$(cat ~/.config/gh-review/token) rtk gh api
        repos/<owner>/<repo>/issues/<pr_number>/comments --paginate`.
      - Unresolved review threads: same GraphQL query as `code-review-workflow:respond`'s Technical Details
        section, filtered to `isResolved: false`, run with the same `GH_TOKEN` prefix.
      - Assemble these three into the JSON shape `code-review-to-github/SKILL.md` step 1 documents and write it to
        `context_file`. Delete any stale `context_file`/`output_file` from a prior round first, so a crashed
        attempt's leftovers can never be mistaken for this round's.

   b. **Codex attempt loop** — up to `codex_retries` times for this round:
      - Run `codex exec` non-interactively with the full text of `.agents/skills/code-review-to-github/SKILL.md` as its
        prompt, plus `repo`, `pr_number`, `commit: <last_reviewed>..<range_to>`, `context_file`, and `output_file`
        (`/tmp/code-review-to-github-payload-<pr_number>.json`). Use `-s workspace-write` so it can run local
        checks and `-m <model>` to pin the review model. Redirect stdin from `/dev/null` (`codex exec` reads stdin
        when a prompt is also piped, and an inherited-but-never-closed stdin from a backgrounded shell hangs it
        forever — confirmed the hard way). Launch via Bash with `run_in_background: true` so its completion resumes
        this workflow instead of blocking the turn:

        ```bash
        codex exec -s workspace-write -m "<model>" "$(cat <<EOF
        Follow .agents/skills/code-review-to-github/SKILL.md exactly.
        repo: <repo>
        pr_number: <pr_number>
        commit: <last_reviewed>..<range_to>
        context_file: /tmp/code-review-to-github-context-<pr_number>.json
        output_file: /tmp/code-review-to-github-payload-<pr_number>.json
        EOF
        )" < /dev/null > <log_file> 2>&1
        ```

      - When it exits, check whether `output_file` exists and parses as the JSON shape
        `code-review-to-github/SKILL.md` step 6 documents (has `commit_id`, `event`, `body`; `comments` present or
        absent is both valid):
        - **Valid file exists** → Codex finished its part. Continue to step (c) to actually publish it. Do not read
          `<log_file>` for finding content from here on — the file is the only source.
        - **Missing or invalid** → Codex did not finish (crashed, sandbox issue unrelated to network, malformed
          output). If attempts remain, wait roughly 30s, then retry the identical `codex exec` call (same commit
          range, same `context_file` — nothing changed). `<log_file>` may be tailed here purely to describe *why*
          the attempt failed, for the eventual Blocked report — never to extract "findings" to act on.
      - If `codex_retries` is exhausted with no valid `output_file`, stop the entire loop — go to step 5 (Blocked).
        Do not proceed to step (c), do not run any fixes this round.

   c. **Publish**: `GH_TOKEN=$(cat ~/.config/gh-review/token) rtk gh api repos/<owner>/<repo>/pulls/<pr_number>/reviews
      -X POST --input <output_file>`. Build no new payload — post `output_file` exactly as Codex wrote it. Verify
      by re-querying `reviews { totalCount }` via GraphQL and confirming it increased; if the POST or the
      verification fails, that's a `gh`/network problem in *this* (unsandboxed) shell, not Codex's sandbox — retry
      the POST itself a few times before treating it as blocked, since this path has been reliable all session and
      a failure here is more likely transient.
   d. Query unresolved review threads (same GraphQL query as step (a), filtered to `isResolved: false`). Every
      prior round's findings are already resolved by step (f) below, so any unresolved thread here is new from
      this round.
   e. Tally each finding by axis (`[Standards]` / `[Spec]` / `[Standards + Spec]`) and priority (`P1`/`P2`/`P3`) parsed
      from its badge/tag — add to the running totals.
   f. **Zero findings** → go to Summary, loop is clean.
      **Any findings** → run `code-review-workflow:respond` for this PR **through all of its own steps**, including
      its final top-level comment mentioning `@alvincheah88` (its own Step 7 "Request Re-review") — not just the
      fix, push, per-thread reply, and resolve. Delegate to the whole skill; don't reimplement part of it by hand
      and stop partway, which is exactly how the final-comment step got skipped once already. All of it happens on
      GitHub — the reply, the resolution, and the summary comment are what make the round traceable later, not a
      commit message alone. Comments it judges invalid still count as "handled" — don't wait for Codex to stop
      repeating something already rebutted with evidence.
   g. `last_reviewed = range_to` (the boundary just reviewed, not the new post-fix HEAD), `round += 1`, loop to (a).
4. **Cap hit**: if the loop exits at `round > max_rounds` with findings still open, stop and report as incomplete — don't
   keep looping silently past the cap.
5. **Codex blocked**: if step 3(b) exhausts `codex_retries` without ever producing a valid `output_file`, stop the
   loop immediately — do not advance to further rounds, do not treat the missing result as "clean," and do not
   fall back to fixing anything based on `<log_file>` content. Report per Summary below with outcome `blocked`, the
   round number, attempts made, and the failure reason read from the log (for diagnosis only).

## Summary (always report at the end)

- Outcome: `clean` (zero findings reached), `cap hit` (findings still open past `max_rounds`), or `blocked` (a round
  could never get a valid `output_file` from Codex after `codex_retries` attempts).
- Rounds executed.
- Findings by axis × priority, e.g. `Standards: P1×1, P2×3 · Spec: P2×1, P3×2`.
- Total elapsed wall-clock time (`start_time` to now).
- If `blocked`: which round, how many `codex exec` attempts, and the error seen in the log.

## Important Rules

- Never create a new branch — both underlying skills already enforce this.
- Don't reach for `/loop` or `ScheduleWakeup` here — this runs synchronously in-session; `Bash run_in_background` on
  `codex exec` is the only async primitive needed.
- Round N's commit range must start at the previous round's `last_reviewed` boundary, not the PR's merge-base again, or
  Codex re-reviews already-resolved code and findings look duplicated.
- **Findings come from the `output_file` Codex writes, never from the log.** If you find yourself about to
  `tail`/`grep` the log for a finding's title, file, or fix — stop; that content only counts once it is in
  `output_file` (and, after step 3c, on the PR itself).
- A `codex exec` retry within step 3(b) reviews the *same* commit range and reads the *same* `context_file` as the
  attempt before it — nothing about the code or PR context changed between attempts, only whatever caused Codex
  not to finish.
- Codex never touches `gh`, `curl`, or the GitHub connector — if a future edit to `code-review-to-github/SKILL.md`
  reintroduces that, it will fail the same instant, deterministic way documented in that file's Network section.
- `nub` is this project's only package manager/runner (never `npm`/`npx`/`pnpm`/`yarn`/`bun`) — any local checks
  `code-review-to-github` runs during step 2 (tests, lint, typecheck) go through `nub run test` / `nub run lint` /
  `nub run typecheck`, per `CLAUDE.md`.

## Related

- `pr-workflow:create` (`.claude/commands/pr-workflow/create.md`) — run first if the PR doesn't exist yet.
- `code-review-to-github` (`.agents/skills/code-review-to-github/SKILL.md`) — the review half (local-only).
- `code-review-workflow:respond` (`.claude/commands/code-review-workflow/respond.md`) — the fix half.
