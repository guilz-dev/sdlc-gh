# Copilot instructions — global harness policy

## Principles

1. Walls are deterministic — never rely on prompt politeness alone.
2. No destructive commands (`git push --force`, `rm -rf /`, production DB).
3. Respect change size limits per autonomy level (see docs/operations.md).
4. Out of scope: production secrets, billing, legal, PII without human approval.

## Change size

- L1: max 300 LOC, 8 files
- L2: max 120 LOC, 4 files
- L3: max 60 LOC, 2 files

Split large changes instead of exceeding limits.

## Task classes

Use Issue labels `task:*` and `autonomy:*`. Default to L1 for implementation tasks.

## Review

Human gate is PR review only. Include harness context in PR description when available.
