---
description: Run Claude Code grill-with-docs on a draft plan, write decisions back, render plan HTML, and write an HTML review
---

Run a `grill-with-docs` session through Claude Code CLI for a draft plan/spec, answer the grilling questions on the user's behalf, write the decisions back into the draft file, then render the plan HTML and create a digestible HTML decision review.

**Input**: The argument is the path to the draft plan and specs.

Example:

```bash
/grill-to-plan-html docs/superpowers/specs/2026-06-27-my-draft-plan.md
```

## Goal

Take a draft plan from uncertain to reviewed and render-ready without requiring the user to answer each `grill-with-docs` question manually.

Produce two outputs:

- Updated draft plan/spec at the same input path.
- Rendered plan HTML from `/plan-html`.
- An HTML review at `docs/grill-with-docs/<yyyy-mm-dd-my-draft-plan-and-specs>.html`.

## Required Skills

Use these skills through Claude Code CLI:

- `/grill-with-docs <path-to-the-draft-plan-and-specs>`
- `/plan-html <path-to-the-draft-plan-and-specs>`

## Steps

1. **Validate input**

   Ensure the draft path exists. If the path is relative, resolve it from the repository root.

   If the path does not exist, stop and report the missing path.

2. **Start Claude Code CLI**

   Run Claude Code from the repository root:

   ```bash
   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude
   ```

   Send this prompt:

   ```text
   /grill-with-docs <absolute-path-to-the-draft-plan-and-specs>
   ```

3. **Answer grill questions on behalf of the user**

   Do not ask the user to answer each question unless the decision is impossible to make from available evidence.

   For every question Claude Code raises:

   - Prefer answering from existing code, `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, and the draft plan.
   - If the answer is not directly proven, choose the most conservative, repo-consistent option.
   - Mark uncertain answers as assumptions.
   - Ask Claude Code to continue after each answer.

   Capture each decision in a running review log. Do not only record the final answer; preserve enough of the grill context that a reader who did not attend the session can understand what was being challenged.

   For each decision, capture this structure:

   - Original question
   - Plain-language question
   - Why the question mattered
   - Chosen decision
   - Practical effect for implementation or future readers
   - Alternatives rejected, if useful
   - Evidence used, if available
   - Any glossary, `CONTEXT.md`, or ADR update needed or made

4. **Let `grill-with-docs` finish**

   Continue until the plan has no unresolved design-tree questions, or until the remaining questions are explicitly documented as assumptions.

   If Claude Code updates `CONTEXT.md` or ADRs, record those changes in the review log.

5. **Write decisions back into the draft plan**

   Before rendering HTML, instruct Claude Code CLI to update the original draft plan/spec file at:

   ```text
   <absolute-path-to-the-draft-plan-and-specs>
   ```

   The updated draft must include the decisions made during the `grill-with-docs` session, including:

   - Accepted decisions
   - Important reasons
   - Explicit assumptions
   - Rejected alternatives when they affect future understanding
   - Any glossary, `CONTEXT.md`, or ADR references that change how the plan should be read

   Keep the update focused. Do not add unrelated implementation detail or expand the scope beyond the reviewed plan.

6. **Render the plan HTML**

   After the grill session is fully completed, command Claude Code CLI to run:

   ```text
   /plan-html <absolute-path-to-the-draft-plan-and-specs>
   ```

   Record the generated plan HTML path in the review log.

7. **Create the grill review HTML files**

   Write the review file to:

   ```text
   docs/grill-with-docs/<yyyy-mm-dd-my-draft-plan-and-specs>.html
   ```

   Both HTML files must be easy to scan and include:

   - Draft source path
   - Confirmation that decisions were written back to the draft source path
   - Generated plan HTML path
   - Question-led decision log
   - Alternatives rejected, where useful
   - Assumptions
   - Glossary, `CONTEXT.md`, or ADR updates needed or made

   The decision log must be simple and easy to understand, but not over-simplified. Write it in ASD-STE100 Simplified Technical English. Use short, direct sentences and active voice. Put only one idea in each sentence. Use explicit nouns instead of ambiguous pronouns. Avoid unnecessary jargon, and define required technical or domain terms when they first appear.

   Use one card per grill decision, with this exact information order:

   1. **Decision title** as a numbered question, for example: `1. Which providers are actually in v1?`
   2. **Question asked during grill**: the specific design question being tested, written in plain language.
   3. **Why it mattered**: the risk, ambiguity, domain rule, or implementation consequence that made the question worth asking.
   4. **Decision**: the answer chosen.
   5. **Practical effect**: what future implementers, reviewers, or product readers should do differently because of the decision.

   Avoid cards that only state conclusions such as "Inventory scope: v1 is reservation lifecycle and concurrency handling." That is too compressed. The review should let a reader reconstruct the grill conversation without needing the chat transcript.

   Keep the HTML self-contained with inline CSS. Avoid external assets.

## Decision Rules

- Prefer the repo's existing language over new terminology.
- Prefer the narrowest reviewed plan that satisfies the draft intent.
- Prefer plan/spec documentation updates over implementation changes.
- Do not create ADRs unless the decision is hard to reverse, surprising without context, and a real trade-off.
- Do not update `CONTEXT.md` with implementation details; only record domain language meaningful to domain experts.
- If Claude Code asks for user input but the codebase can answer it, inspect the codebase and answer directly.

## Output Summary

When finished, report:

- Claude Code grill session completed.
- Generated plan HTML path.
- HTML review path.
- Any assumptions or unresolved risks.
