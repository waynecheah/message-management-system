---
name: "PR Workflow: Create"
description: Commit, push, and create a GitHub pull request with full automation
category: GitHub
tags: [github, pr, pull-request, commit, push, workflow]
---

End-to-end workflow for committing changes, pushing to GitHub, and creating a structured pull request.

I'll help you:

1. Stage and commit your changes with a conventional commit message
2. Push to GitHub (creating upstream if needed)
3. Create a structured PR with proper title, body, labels, and review request
4. Assign reviewers and request code review from @alvincheah88

## When to Use

- A feature, fix, or change is complete and ready to be submitted as a PR
- The user says "create PR", "make a PR", "open PR", "submit PR", "push and PR this", "ship this", "ready for review", or similar
- You need to commit remaining changes and get them into a pull request in one flow

**Input**: Run this command when your feature/fix is complete and ready for review.

---

## Steps

### Step 1 — Determine what to commit

```bash
git status --porcelain
git diff --cached --name-only
```

**If staged files exist:** commit only those — the user intentionally staged a subset. Do NOT stage additional unstaged changes.

**If no staged files exist:** stage everything with `git add -A`. This means the user is satisfied with all current changes.

If the working tree is clean, skip to Step 3.

### Step 2 — Write and create the commit

Analyze the staged diff to understand what changed:

```bash
git diff --cached --stat
git diff --cached
```

**Conventional commit type:**

| Type       | When to use                          |
| ---------- | ------------------------------------ |
| `feat`     | New feature or capability            |
| `fix`      | Bug fix                              |
| `refactor` | Code restructure, no behavior change |
| `chore`    | Tooling, deps, config, build         |
| `docs`     | Documentation only                   |
| `test`     | Tests only                           |
| `perf`     | Performance improvement              |
| `style`    | Formatting/lint, no logic change     |
| `ci`       | CI/CD pipeline changes               |

**Format:**

```
<type>(<scope>): <short imperative summary under 72 chars>

<optional body: one paragraph explaining the why>
```

Commit with a heredoc to avoid quoting issues on multi-line messages:

```bash
git commit -m "$(cat <<'EOF'
feat(scope): add example feature

Brief explanation of why this change was made.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

### Step 3 — Push to GitHub

Check for an existing upstream:

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
```

- If upstream exists: `git push`
- If no upstream: `git push -u origin HEAD`

### Step 4 — Create the PR

Gather context:

```bash
BASE=$(git remote show origin | sed -n 's/.*HEAD branch: //p')
git log "$BASE"..HEAD --oneline      # commits in this branch vs base
git diff "$BASE"...HEAD --stat       # files changed
```

Check whether a PR already exists:

```bash
gh pr view --json url,state 2>/dev/null
```

**If a PR already exists and is open**, print its URL and ask the user whether they want to update it instead. Do not create a duplicate.

Create the PR:

```bash
gh pr create \
  --base "$BASE" \
  --title "<concise title ≤70 chars>" \
  --body "$(cat <<'EOF'
<body>
EOF
)"
```

### Step 5 — Add assignee

```bash
gh pr edit --add-assignee "@me"
```

### Step 6 — Add labels

Labels must exist in the repo before they can be applied — `gh pr edit --add-label` fails on a missing label. Create first, then apply:

```bash
# Create if missing (no-op if it already exists)
gh label create "feature" --color "#0075ca" --description "New feature or request" 2>/dev/null || true

# Apply
gh pr edit --add-label "feature"
```

A PR can receive multiple labels (e.g. `feature` + `breaking-change`).

### Step 7 — Request review

Build a comment that gives the reviewer enough context to review meaningfully.

**Detect whether a Superpowers spec or plan exists for this change:**

```bash
# Branch name often matches the change name (e.g. feature/org-management-core → org-management-core)
BRANCH=$(git rev-parse --abbrev-ref HEAD | sed 's|.*/||')
find docs/superpowers/specs docs/superpowers/plans \
  -type f -name "*$BRANCH*.md" 2>/dev/null
```

Also try a fuzzy match if the exact branch name doesn't hit:

```bash
find docs/superpowers/specs docs/superpowers/plans \
  -type f -name "*.md" 2>/dev/null
```

**If a spec or plan is found**, include each artifact that exists:

```
Please review this PR @alvincheah88.

**Context:** <1–2 sentence summary of what the PR does and what problem it solves — derived from the PR summary you already wrote>

For the full design rationale and scope, refer to the matching Superpowers [specs](docs/superpowers/specs/) document:
`<relative path under docs/superpowers/specs/>`

For implementation details, refer to the matching Superpowers [plans](docs/superpowers/plans/) document:
`<relative path under docs/superpowers/plans/>`

Key areas to focus on:
- <area 1, e.g. "API contract changes in src/api/">
- <area 2, e.g. "permission checks in middleware">
- <area 3 if relevant>
```

**If no spec or plan is found:**

```
Please review this PR @alvincheah88.

**Context:** <1–2 sentence summary of what the PR does and what problem it solves>

Key areas to focus on:
- <area 1>
- <area 2>
```

Post it:

```bash
gh pr comment --body "$(cat <<'EOF'
<composed comment>
EOF
)"
```

The context summary should be a concise version of the PR's Summary section — not copied verbatim, just enough for the reviewer to understand the intent at a glance.

### Step 8 — Report back

Print a concise summary:

```
✅ PR created: <PR URL>

Branch:   <branch> → <base>
Commit:   <hash> <subject>
Labels:   <labels applied>
Assigned: @me
```

## PR Body Template

Use this structure. **Omit optional sections when not applicable — don't write "N/A".**

```markdown
## Summary

<1–3 sentences: what this PR does and what problem it solves>

## Scope

### Added

- <new feature or capability>

### Updated

- <changed behavior or improvement>

### Fixed

- <bug fixed, if any>

## Test Results

- [ ] Unit tests passing
- [ ] Integration tests passing
- <specific test commands run, e.g. `nub run test` — 42 passed, 0 failed>
- <note any tests added for new functionality>

## Related Spec

> Include the exact Superpowers [specs](docs/superpowers/specs/) and/or
> [plans](docs/superpowers/plans/) path so the reviewer's Spec axis can anchor to
> the originating requirements and implementation intent. Omit only when neither
> artifact exists.

- Spec: `<relative path under docs/superpowers/specs/>`
- Plan: `<relative path under docs/superpowers/plans/>`

## Breaking Changes

> ⚠️ Only include this section if there are breaking changes.

- <describe what breaks and the migration path>

## Related Issues

> Only include if there are linked issues.

Closes #<issue-number>

## Verification Checklist

**Manual reproduction steps:**

1. <step 1>
2. <step 2>
3. <expected result>

**Risks:**

- <any risks introduced — performance, security, data migration>

**Rollback plan:**

- Revert this PR / feature flag off / <specific steps>

## Performance & Security Notes

> Include only if relevant.

- <performance impact or security considerations>

## Notes / Follow-ups / TODOs

> Include only if there are known gaps or future work.

- [ ] <TODO item>

---
```

**Fill in all sections from the actual diff.** Do not leave placeholder text.

## Labels

Applied based on PR type:

| Type            | Label             | Color     |
| --------------- | ----------------- | --------- |
| New feature     | `feature`         | `#0075ca` |
| Bug fix         | `bug`             | `#d73a4a` |
| Refactoring     | `refactor`        | `#e4e669` |
| Documentation   | `documentation`   | `#0075ca` |
| Chore/tooling   | `chore`           | `#cfd3d7` |
| Breaking change | `breaking-change` | `#b60205` |
| Performance     | `performance`     | `#84b6eb` |
| Tests           | `tests`           | `#0e8a16` |

## Important Rules

- **Never create a new branch during this workflow** — commit to the current feature branch
- **Respect staged files** — if the user staged specific files, commit only those
- **Never commit to `main`/`master` directly** — warn the user if they're on the default branch
- **No duplicate PRs** — check `gh pr view` before calling `gh pr create`
- **Don't leave placeholder text in the PR body** — read the actual diff to fill in real content
- **If `gh` is not authenticated**, tell the user to run `gh auth login` first

## Repository Context

Never hardcode the repository. Derive it from the checkout so this command works in any project:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BASE=$(git remote show origin | sed -n 's/.*HEAD branch: //p')
```

- **Default base branch:** auto-detected (usually `main`)
- **Commit co-author:** `Claude Opus 5 <noreply@anthropic.com>`

## Related

- Use [`/code-review-workflow:respond`](../code-review-workflow/respond.md) to handle review feedback after the PR is open
- [GitHub CLI Manual](https://cli.github.com/manual/)
