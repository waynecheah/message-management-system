---
name: "Code Review Workflow: Respond"
description: Handle code review comments, fix issues, and resolve review threads
category: GitHub
tags: [github, code-review, pr, feedback, resolve, workflow]
---

Handle GitHub pull request code review feedback with a structured 7-step workflow.

I'll help you:
1. Find all unresolved review comments and threads on your PR
2. Analyze each comment for validity
3. Fix code issues in your current branch
4. Commit and push to the same branch
5. Respond to each comment with explanation
6. Mark threads as resolved in GitHub
7. Leave a final comment mentioning @alvincheah88 to verify all issues are resolved

## When to Use

- You need to respond to code review comments on a GitHub PR
- A reviewer has left feedback that needs to be addressed
- You need to ensure review threads are properly marked as resolved

**Input**: Run this when you've received code review feedback (e.g., from @alvincheah88) that needs addressing.

---

## Workflow Steps

1. **Identify review comments**
   - Query all review threads from the PR
   - **FILTER to UNRESOLVED threads only** (`isResolved: false`)
   - Get comment IDs, thread IDs, content, file paths, and line numbers
   - List all unresolved threads that need responses

2. **Analyze each comment**
   - Determine if valid or invalid
   - Read the finding's **axis** and **priority**. The `code-review-to-github` reviewer prefixes each inline comment with `[Standards]`, `[Spec]`, or `[Standards + Spec]` and a `P1`/`P2`/`P3` badge.
   - **Triage by priority** — address `P1`/`P2` before `P3`; a `P3` may be justified-and-deferred with a reasoned reply.
   - **Match the response to the axis** — a `[Spec]` finding needs a spec citation; a `[Standards]` finding needs the cited standard/heuristic addressed or rebutted.
   - Plan fixes or responses accordingly

3. **Fix in current branch** ⚠️
   - **CRITICAL**: Never create a new branch
   - Fix code/documentation directly in the current PR branch
   - This ensures fixes auto-update the PR

4. **Commit and push**
   - Commit fixes to same branch
   - Push to GitHub (PR auto-updates)

5. **Respond to each thread**
   - Post detailed reply explaining the fix or why comment is invalid
   - Include evidence: code diffs, file paths, commits
   - Use templates for consistency

6. **Mark as Resolved** (MANDATORY)
   - Mark every conversation thread as resolved, even if the fix was trivial
   - Verify `isResolved: true` in response
   - **If it fails, explicitly report why** — never leave a thread silently unresolved

7. **Request Re-review**
   - Leave a final comment mentioning @alvincheah88 to verify all issues have been resolved
   - Provide summary of changes made
   - Ask for approval to proceed with merge

## Response Templates

Echo the finding's `[axis]` (and its priority when useful) in the reply so the audit trail preserves how the reviewer framed it.

**For Valid Comments (with fix):**
```
✅ FIXED [<axis>] — [Description of what was corrected]

Changes made:
- [File path]: [Change description]
- [File path]: [Change description]

Committed in [commit hash].
```

**For Invalid Comments (with evidence):**
```
This comment is INVALID [<axis>] — [why it's incorrect]

Evidence:
✅ [Proof point 1 — cite the exact standard (Standards) or spec requirement (Spec)]
✅ [Proof point 2]
✅ [Code/file reference]

[Explain the current actual state]
```

**For deferred P3 (justified, no code change):**
```
ACKNOWLEDGED [<axis> · P3] — deferring with reason.

[Why the lower-priority finding is acceptable as-is, or tracked for follow-up.]
```

## Important Rules

- **⚠️ NEVER create new branches** — Fix in current PR branch only
- **Find ALL review threads via GraphQL** — Comments live in separate threads, not main review
- **⚠️ FILTER to unresolved threads only** — After fetching, show only threads where `isResolved: false`. GitHub returns both resolved and unresolved in one response.
- **Always respond before resolving** — Post detailed explanation
- **Always complete all steps** — Don't skip marking threads resolved. **If resolving fails, explicitly report why**
- **Invalid comments need evidence** — Never dismiss without documented proof
- **Provide context** — In responses, include:
  - What was changed (for valid comments)
  - Why the comment is incorrect (for invalid comments)
  - References to commits, file paths, or actual code state
  - Commit hash or branch reference
- **Audit trail** — Response threads document your reasoning
- **Verify resolution** — After the GraphQL mutation, confirm `"isResolved": true` in the response

## Technical Details

### Resolve the repository first

Never hardcode the repo. Read it from the checkout so this command works in any
project:

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
NAME=$(gh repo view --json name -q .name)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
```

### Finding Review Threads (CRITICAL - DO NOT SKIP)

**⚠️ MANDATORY:** Fetch review threads with ALL required fields. Missing any of these causes you to miss unresolved comments:

- `isResolved` — **CRITICAL**: Filter to `isResolved: false` to find threads needing responses. Without this, you won't see which comments need action.
- `path` + `line` — Identify which files/lines the comments reference
- `id` — Thread ID needed to mark as resolved later

```bash
gh api graphql -F owner="$OWNER" -F name="$NAME" -F pr={pr_number} -f query='
query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 10) {
            nodes {
              id
              databaseId
              body
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}
'
```

**After fetching, FILTER the results:**
- Show only threads where `isResolved: false`
- For each unresolved thread, display: thread ID, file path, line number, comment body, author
- Skip any threads where `isResolved: true` — those are already handled

**Why this matters:** GitHub's GraphQL API returns both resolved and unresolved threads in a single list. Without explicitly filtering, you'll try to respond to already-resolved threads (wasting time) and miss new comments added after previous review rounds.

### Committing and Pushing (⚠️ same branch — never a new one)

```bash
git add -A
git commit -m "fix: [description of fixes]"
git push origin "$BRANCH"
```

Pushing to the same branch auto-updates the PR, which is what keeps the replies
and resolutions attached to the review they belong to.

### Posting Replies

```bash
gh api "repos/$OWNER/$NAME/pulls/{pr_number}/comments/{comment_databaseId}/replies" \
  -f body="Your response text"
```

Use `databaseId` from the query above, not the node `id`.

### Marking Threads Resolved

```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "THREAD_ID"}) {
    thread {
      isResolved
    }
  }
}
'
```

**Verify:** the response must show `"isResolved": true`. If the mutation fails,
report the error and explain why — do not move on leaving the thread unresolved.

## Example Workflow

```
Code review feedback from @alvincheah88 on PR #16:

1. ✅ Queried review threads via GraphQL (8 threads, 4 unresolved after filtering)
2. ✅ Analyzed all 4 unresolved comments (3 valid, 1 rebutted with evidence)
3. ✅ Fixed code IN CURRENT BRANCH (feature/org-permissions-v2 — no new branch created)
   - Fixed migration: changed text[] to jsonb, "member" to "members"
   - Fixed JWT payload: added JSON parsing for customRoleIds
   - Fixed containment check: jsonb @> operator instead of exact match
4. ✅ Committed and pushed to same branch (auto-updated PR #16)
5. ✅ Responded to all 4 threads with explanations and commit references
6. ✅ Marked all 4 threads as RESOLVED (verified isResolved: true):
   - PRRT_kwDOQqeM1s59bPWm ✓
   - PRRT_kwDOQqeM1s59bPWv ✓
   - PRRT_kwDOQqeM1s59bPWz ✓
   - PRRT_kwDOQqeM1s59bPW4 ✓
7. ✅ Requested re-review from @alvincheah88 with a summary of changes
```

## Related

- Use [`/pr-workflow:create`](../pr-workflow/create.md) to create the initial PR
- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
