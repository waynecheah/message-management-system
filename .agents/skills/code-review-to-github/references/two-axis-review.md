# Two-Axis Review

Analyze the requested diff independently against repository standards and the
originating specification. Return review candidates only; the parent skill owns
verification, prioritization, GitHub anchoring, and publication.

## Contents

- Discover sources
- Standards axis
- Spec axis
- Independent execution
- Candidate contract

## Inputs

Provide each reviewer with:

- the exact diff command and reviewed commit list;
- the PR title, body, and conversation comments;
- applicable standards-source paths and relevant contents;
- the specification source, when one exists.

## Discover sources

### Standards

Use the most specific instructions that apply to each changed file:

1. `AGENTS.md` and `CLAUDE.md`, from the repository root down to the file;
2. `CONTRIBUTING.md`, `CODING_STANDARDS.md`, and equivalent style guides;
3. relevant prescriptive ADRs or domain documentation.

Repository rules override the smell baseline below. Skip formatting or checks
that existing tooling already enforces.

### Specification

Resolve the originating requirement in this order:

1. an exact Superpowers [specs](docs/superpowers/specs/) or
   [plans](docs/superpowers/plans/) path supplied by the user or named in the PR
   body or comments;
2. issue references in the reviewed commits, PR body, or comments, fetched through
   `docs/agents/issue-tracker.md` when available or the GitHub connector;
3. a matching design spec under [specs](docs/superpowers/specs/) or implementation
   plan under [plans](docs/superpowers/plans/);
4. the PR body, but only when it states verifiable requirements.

Validate every discovered path locally. Read exact Superpowers documents named
under [specs](docs/superpowers/specs/) as originating requirements and exact
documents named under [plans](docs/superpowers/plans/) as implementation intent.
Use explicit paths to select the feature; do not guess different documents from
similar names.

If none exists, mark the Spec axis as skipped. Do not treat the implementation
itself as its own specification.

## Standards axis

Check the diff for documented-standard violations and concrete instances of
these design heuristics:

- **Mysterious Name**: a name hides the value or behavior it represents.
- **Duplicated Code**: the same logic shape is repeated in the change.
- **Feature Envy**: behavior mostly manipulates another object's data.
- **Data Clumps**: the same fields or parameters repeatedly travel together.
- **Primitive Obsession**: a domain concept is represented by an unsafe primitive.
- **Repeated Switches**: equivalent condition trees recur in multiple places.
- **Shotgun Surgery**: one behavior change requires scattered edits.
- **Divergent Change**: one module changes for unrelated reasons.
- **Speculative Generality**: abstractions exist for requirements not requested.
- **Message Chains**: callers navigate through several internal objects.
- **Middle Man**: a layer adds delegation without useful policy or behavior.
- **Refused Bequest**: an implementation inherits a contract it mostly rejects.

Treat heuristics as judgement calls, never automatic violations. Return one only
when it has a specific maintenance or correctness impact in this diff.

## Spec axis

Check for:

- requirements that are missing or only partially implemented;
- behavior that contradicts a requirement;
- behavior outside the requested scope;
- implementation that appears present but fails the stated acceptance behavior.

Cite the exact requirement for every candidate. Do not infer requirements from
personal preference.

## Independent execution

When sub-agents are available, run the Standards and Spec axes in parallel so
their conclusions do not influence each other. If the specification is
unavailable, run only the Standards reviewer. If parallel execution is
unavailable, perform separate passes and keep their notes isolated.

Give sub-agents raw artifacts and these rules, not suspected findings. Keep them
read-only: they must not edit files, run external mutations, or publish reviews.
Keep each report under 400 words.

## Candidate contract

Return each candidate with:

- `axis`: `Standards` or `Spec`;
- concise title;
- file path and changed line or hunk;
- evidence from the diff;
- governing standard or exact spec citation;
- concrete failure mode or maintenance impact;
- expected correction;
- suggested `P1`, `P2`, or `P3`.

Return the two axis reports separately. Do not deduplicate, rerank, anchor, or
publish candidates; the parent skill performs those steps.
