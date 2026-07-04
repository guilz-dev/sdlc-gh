# Copilot instructions — global harness policy

## Principles

1. Walls are deterministic — never rely on prompt politeness alone.
2. No destructive commands (`git push --force`, `rm -rf /`, production DB).
3. Respect change size limits per autonomy level (see docs/operations.md).
4. Out of scope: production secrets, billing, legal, PII without human approval.

## CC-SD contract (L1 docs / test-fix)

When implementing `task:docs` or `task:test-fix` at `autonomy:L1`, treat the Issue as the spec:

- `Goal`, `Non-goals`, `Constraints`, `Acceptance criteria`, `Rollback hints` (required)
- `Additional context` (optional)

Implementer boundary: `Goal`, `Non-goals`, `Constraints`, `Acceptance criteria`.
Reviewer checks requirement fit and non-goal preservation.
v1 does not enforce CC-SD on `feature-small`, `infra`, or `security-sensitive`.

## Change size

- L1: max 300 LOC, 8 files
- L2: max 120 LOC, 4 files
- L3: max 60 LOC, 2 files

Split large changes instead of exceeding limits.

## Task classes

Use Issue labels `task:*` and `autonomy:*`. Default to L1 for implementation tasks.

## Review

Human gate is PR review only. Mirror the Issue contract in the PR summary and include harness context when available.
