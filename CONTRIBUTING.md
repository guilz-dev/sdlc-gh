# Contributing to SDLC-GH

Thanks for contributing to `sdlc-gh`.

This repository is both:

- a reusable harness template for other repositories
- a self-hosted example of the same guardrails it recommends

That means contributions should be small, explicit, and easy to verify.

## Before you start

- Search existing Issues and PRs to avoid duplicating work
- Open an Issue first for substantial behavior or policy changes
- Keep changes focused; avoid bundling unrelated fixes
- Do not commit secrets, credentials, or private repository metadata

## Development setup

Requirements:

- Node.js 18+ for basic checks
- Node.js 22 for full parity with CI and executable E2E verifiers
- Python with `pytest` if you are changing eval convention tests

Clone the repository and run the local checks from the root:

```bash
npm run validate
npm run test-hooks
npm run test-issue-spec
npm run check-e2e
npm run verify-bootstrap
```

Optional convention tests:

```bash
pip install pytest
pytest evals/trajectories -q
```

## Change types

Typical contribution areas:

- documentation and adoption guidance
- harness CI and workflow improvements
- hook rules and safety policy
- eval fixtures, scoring, and telemetry schema
- bootstrap and sync behavior across supported stacks

If you are changing harness assets under `.github/**`, `evals/**`, or canonical policy documents, expect stricter review because those changes affect downstream adopters.

## Pull request expectations

PRs should:

- explain what changed and why
- link the relevant Issue when one exists
- stay within the autonomy and diff-size expectations documented in `docs/operations.md`
- include updates to docs or evals when behavior or policy changes
- pass the relevant local checks before review

Use the PR template sections completely:

- `Summary`
- `Goal implemented`
- `Non-goals preserved`
- `Constraints handled`
- `Acceptance criteria`
- `Rollback`

## Review policy

This repository applies its own harness rules to itself.

- Changes to `.github/**`, `evals/**`, `docs/telemetry-schema.md`, and `docs/operations.md` require review from the team configured in `.github/CODEOWNERS`
- Keep policy and workflow changes deterministic and testable
- Prefer mechanical enforcement over adding more prompt text when both are possible

## Design guidance

When proposing a change, preserve the repository's core design rules:

1. deterministic walls over prompt-only discipline
2. one clear human gate at PR review
3. no harness change without verification

If a proposal weakens one of those, call out the tradeoff explicitly in the PR.

## Reporting problems

- For bugs, open a GitHub Issue with reproduction steps and expected behavior
- For security issues, do not open a public Issue; follow `SECURITY.md`
- For usage questions, see `SUPPORT.md`
