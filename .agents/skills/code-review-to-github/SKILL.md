---
name: code-review-to-github
description: Review a GitHub pull request from the local repository for a required commit or commit range along repository-standards and originating-spec axes, use local code context, tests, CodeGraph, and available memory tools to find concrete issues, then write one review payload to a local file for the orchestrator to publish. Use when the user asks to run $code-review-to-github, post review findings to GitHub, or review a PR/commit and publish comments.
---

# Code Review To GitHub

Review a specified PR commit or commit range locally. This skill does **not** talk to GitHub itself — it reads
pre-fetched PR context from a file and writes its finished review to a file, both provided/consumed by whatever
invoked it (normally `review-fix-loop`). When the review has findings, it also writes one local HTML record for
the review round. See Network below for why.

## Inputs

- `repo`: optional `owner/name`; default to `waynecheah/monorepo` when omitted.
- `pr_number`: required PR number.
- `commit`: required commit SHA or commit range.
  - Single commit examples: `d1e77b5`, `d1e77b5abc...`
  - Range examples: `d1e77b5 - 131a49e`, `d1e77b5..131a49e`
- `context_file`: required path to a JSON file, already written by the caller, containing the PR's current state
  and existing review context (shape in step 1). If missing or unreadable, stop and report that instead of
  guessing at PR state.
- `output_file`: required path this skill writes its finished review payload to (shape in step 6). Defaults to
  `/tmp/code-review-to-github-payload-<pr_number>.json` if the caller doesn't specify one.

If `pr_number`, `commit`, or `context_file` is missing, ask for the missing value before doing review work.

## Network

**This skill must not call `gh`, `curl`, or any other network command, and must not use the Codex GitHub
connector (`add_review_to_pr` or any `codex_apps/github.*` tool).** Confirmed by direct test: under `-s
workspace-write`, a plain `curl https://api.github.com` from this skill's own shell fails in 0ms with "Could not
resolve host" — not a timeout, not flaky DNS, an instant sandbox-level block on outbound network from spawned
shell commands. No credential, retry, or `rtk` placement fixes that; earlier revisions of this skill tried
`GH_CONFIG_DIR`-based accounts, then a `GH_TOKEN`-from-file account, and both failed identically because the
problem was never the credential. Two prior real bugs got fixed along the way and are still worth knowing about
if `gh` is ever run from an *unsandboxed* shell (`review-fix-loop`'s own commands, for instance): `rtk env
VAR=value cmd` is not a valid `rtk` invocation (`env` isn't a real subcommand) — the assignment goes before
`rtk`, e.g. `VAR=value rtk gh ...`; and macOS Keychain-backed `gh auth login` tokens aren't retrievable from a
sandboxed process at all, so a file-based `GH_TOKEN` is the only kind of credential that could ever work here —
but no credential fixes a hard network block, which is what this actually is.

So: everything this skill needs from GitHub arrives as input (`context_file`), and everything it produces for
GitHub leaves as output (`output_file`). Nothing in between touches the network.

## Workflow

1. **Resolve and validate the target**
   - Read `context_file`. Expected shape:
     ```json
     {
       "pr": { "number": 93, "state": "OPEN", "baseRefName": "main", "headRefOid": "<sha>", "url": "..." },
       "conversation_comments": [{ "author": "...", "body": "...", "createdAt": "..." }],
       "review_threads": [
         { "id": "...", "isResolved": false, "path": "...", "line": 12,
           "comments": [{ "id": "...", "body": "...", "author": "..." }] }
       ]
     }
     ```
   - Verify `pr.number` matches `pr_number` and `pr.state` is `OPEN`. Stop if not — this file is the only source
     of PR state available to this skill; do not try to re-fetch or second-guess it over the network.
   - Use `conversation_comments` for spec-path and issue references — do not assume PR metadata includes them.
   - Use `review_threads` (already filtered to `isResolved: false` by the caller) as the authoritative record of
     earlier findings, so a review started in a fresh session has the same cumulative surface as one continuing a
     prior discussion.
   - Resolve commit inputs locally with `git rev-parse` (a local git operation, not network — unaffected by the
     block above).
   - For a single commit, review `commit^..commit`.
   - For a range, review `left..right` and use the right endpoint as the reviewed commit.
   - Verify the reviewed commit is part of the PR history when possible (`git merge-base --is-ancestor`, also
     local). If it is not, stop and explain.

2. **Build review context locally**
   - Inspect the requested diff with `git diff --stat`, `git diff --name-only`, and targeted `git diff`.
   - Use CodeGraph before manual file reads when the repo is indexed (a `.codegraph/` directory at the repo root)
     and code impact or symbol flow is relevant. CodeGraph is a local daemon (Unix socket), not network — unaffected.
   - Use Codebase Memory MCP if available and relevant to recall prior architecture decisions or known module behavior.
   - Use the current session context for follow-up reviews. A skill invocation may be a later pass after prior discussion.
   - For a follow-up commit, maintain a cumulative review surface: record each prior finding and its
     claimed fix, then re-read the full affected contract section (including neighboring unchanged
     lines) rather than inspecting only the new additions. A fix can expose or repeat a separate
     defect that was already present at the start of the follow-up.
   - Run focused tests, type checks, linters, or package-specific commands when they materially increase confidence. Prefer existing repo scripts and keep scope proportional to changed files.

3. **Run independent Standards and Spec analysis**
   - Read [references/two-axis-review.md](references/two-axis-review.md) completely before identifying findings.
   - Apply it to the resolved diff command and commit list, PR metadata and conversation comments, applicable repository standards, and discovered specification.
   - Prefer exact Superpowers paths under [specs](docs/superpowers/specs/) or [plans](docs/superpowers/plans/) named in the PR body or comments, and validate each path locally before using discovery fallbacks.
   - Run its Standards and Spec axes independently. Treat their outputs as candidates only; sub-agents must not publish or modify anything.
   - For API and error-contract changes, explicitly distinguish transport metadata from the response
     body: check HTTP status separately from envelope fields, field names, exact values, and envelope
     shape. Compare prose summaries, design notes, examples, and the exact spec scenario against
     that same contract.
   - If no specification is available, skip the Spec axis and record that limitation instead of inventing requirements.

4. **Find only actionable issues**
   - Validate candidates from both axes against local code context and focused checks.
   - Preserve each candidate's axis. Deduplicate only the same concrete root cause; when both axes support it, label it `Standards + Spec`.
   - Report concrete correctness, security, data integrity, concurrency, API contract, migration, or test-coverage risks.
   - Do not publish style nits, speculative concerns, or findings without a clear failure mode.
   - Always run a final reconciliation pass before publishing, whether or not findings were
     already identified:
     - map every prior finding to the exact changed text that resolves it;
     - compare every related summary/design/spec statement with the actual contract, including
       unchanged surrounding text;
     - check that transport status, body fields, values, and envelope shape are not conflated;
     - keep a concrete issue even when it predates the reviewed commit. If it cannot be anchored to
       a changed line, put it in the review body instead of silently dropping it.
   - Assign priority:
     - `P1`: likely production breakage, security issue, data loss/corruption, or merge blocker.
     - `P2`: real bug or important regression risk that should be fixed before or soon after merge.
     - `P3`: lower-risk issue, maintainability problem with a concrete impact, or missing targeted test for risky code.
   - Each finding must have a file path, changed-line anchor, title, priority, and concise markdown explanation.

5. **Prepare GitHub review anchors**
   - Anchor inline comments only on lines present in the PR diff.
   - Prefer `line` + `side: RIGHT` for new/changed lines.
   - Use `start_line`, `line`, `start_side`, and `side` for multi-line findings only when the whole range exists in the diff.
   - If the relevant line cannot be anchored in the PR diff, put that finding in the review body instead of inventing an anchor.
   - `line`/`side` (and `start_line`/`start_side`) are the fields GitHub's "create a review" REST endpoint actually
     accepts — no separate `position` calculation against the file patch is needed.

6. **Write exactly one review payload**
   - Write JSON to `output_file` (create parent directories if needed) — this remains the only payload for GitHub
     publication; do not print the review elsewhere or consider the run complete without this file existing.
   - For findings:
     ```json
     {
       "commit_id": "<full 40-char sha of the reviewed commit>",
       "event": "COMMENT",
       "body": "<review summary, see Review Body Formats>",
       "comments": [
         { "path": "...", "line": 42, "side": "RIGHT", "body": "<finding, see Review Body Formats>" }
       ]
     }
     ```
   - For no findings, omit `comments` entirely:
     ```json
     { "commit_id": "<full sha>", "event": "COMMENT", "body": "<no-issue body>" }
     ```
   - `commit_id` is the full 40-character SHA of the reviewed commit — resolve it locally with `git rev-parse
     <ref>`; do not omit it.
   - Exactly one JSON object in `output_file`, one `comments` entry per finding. This skill's GitHub-facing work
     ends once that file is written correctly — publishing it to GitHub, verifying it landed, and retrying on
     failure is the caller's responsibility, not this skill's. Continue to step 7 only to create the local HTML
     record when the payload contains findings.

7. **Create or update one HTML findings record**
   - Run this step only when the final payload has a non-empty `comments` array. Do not create an HTML record for
     a no-issue review.
   - Use the finished `output_file` as the only source for the HTML content. Do not reconstruct fields from notes
     or intermediate findings.
   - Create `.docs/code-reviews/` when it does not exist.
   - Read [assets/review-record-template.html](assets/review-record-template.html) and use it as the exact HTML
     structure and visual style. Do not redesign the document during each review.
   - Determine the review round from existing files for the same PR. Reuse the round when a record already has the
     same `commit_id`; otherwise use one more than the highest existing round, starting with round `1`.
   - Set `FINDING-NUMBER` to the total number of entries in `comments`.
   - Write the file as:
     ```text
     .docs/code-reviews/pr-<PR_NUMBER>-round-<REVIEW-ROUND>-<FINDING-NUMBER>.html
     ```
   - Keep exactly one HTML file for each PR. When the review round or `FINDING-NUMBER` changes, replace the
     earlier `pr-<PR_NUMBER>-round-*.html` file with the current filename.
   - Include the top-level `commit_id`, `event`, and `body`. Preserve their values exactly as they appear in the
     review payload that the caller publishes to GitHub.
   - Include one section for each `comments` entry. Preserve `path`, `line`, and `side` exactly as they appear in
     the published payload.
   - Rewrite only each comment's `body` for the HTML record in ASD-STE100 Simplified Technical English. Preserve
     the finding's priority badge, axis label, title, technical meaning, evidence, risk, and expected correction.
     Use short, direct sentences and active voice. Put one idea in each sentence. Use explicit nouns instead of
     ambiguous pronouns. Avoid unnecessary jargon, and define required technical or domain terms when they first
     appear.
   - HTML-escape every replacement value. Replace the top-level template placeholders once. Duplicate the block
     between `FINDING_CARD_START` and `FINDING_CARD_END` once for each comment, replace its comment placeholders,
     and remove the marker comments. Do not leave unresolved `{{PLACEHOLDER}}` values in the finished file.
   - Do not modify `output_file` while creating the HTML. GitHub must receive the original JSON payload; the
     ASD-STE100 rewrite exists only in the HTML record.
   - Keep the template's inline CSS and self-contained structure. Preserve whitespace and line breaks so every
     recorded value remains readable.

## Review Body Formats

Findings use this exact top-card format for the payload's top-level `body`:

```md
💡Codex Review
Here are some automated review suggestions for this pull request.

Reviewed commit: d1e77b5
```

After the top card, add a concise axis summary:

```md
Standards: 1 finding.
Spec: 2 findings.
```

If the Spec axis was skipped, say `Spec: skipped — no specification available.`

Use the requested commit text if it is a single commit. For a range, use `left..right` or `left - right` consistently with the user's input, and also include the resolved right-end commit when useful:

```md
Reviewed commit: d1e77b5..131a49e
```

Each inline comment's `body` field should use this shape:

```md
**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub> [Standards] Issue title**

Issue content in markdown. Explain the bug, why it matters, and the expected correction.
```

Use an orange badge for `P1`, yellow for `P2`, and blue for `P3`:

```md
https://img.shields.io/badge/P1-orange?style=flat
https://img.shields.io/badge/P2-yellow?style=flat
https://img.shields.io/badge/P3-blue?style=flat
```

GitHub renders the file path and code block from the inline review anchor. Do not paste the surrounding code into the comment body unless it is necessary for clarity.

Use `[Standards]`, `[Spec]`, or `[Standards + Spec]` in every inline title.

When no issues are found, use this `body`:

```md
Codex Review: Didn't find any major issues. 🚀

Reviewed commit: d1e77b5
```

Keep the no-issue message accurate. If tests were not run, do not imply full verification.
If the Spec axis was skipped, append `Spec review skipped: no specification available.`

## Final Response

Tell the caller the current state:

- `Payload written`: include the PR, reviewed commit/range, number of inline findings by axis, `output_file`'s
  path, the HTML record path when findings exist, and any tests/checks run. This is the success case — it does
  not mean the review is on GitHub yet, only that this skill's part is done.
- `No issue found`: same as above, but the payload has no `comments` and no HTML record — still counts as
  "written," not "blocked."
- `Blocked`: explain the exact blocker — `context_file` missing/unreadable, PR state in it is not `OPEN`,
  commit not found, or inability to anchor findings. Do not write a partial or best-guess `output_file` in this case.
