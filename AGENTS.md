# Agent Harness — Project Instructions

## Purpose

This repository (or a product repo using this harness) follows the agent harness architecture in `docs/arch.md`. Human judgment converges on **PR review only**.

## CC-SD contract (L1 docs / test-fix)

For `task:docs` and `task:test-fix` delegated at `autonomy:L1`, the Issue embeds a lightweight CC-SD contract with these canonical fields:

| Field | Required |
|-------|----------|
| `Goal` | yes |
| `Non-goals` | yes |
| `Constraints` | yes |
| `Acceptance criteria` | yes |
| `Rollback hints` | yes |
| `Additional context` | optional |

CI enforces completeness via `issue-spec-check`. Enforcement uses Issue **labels** applied by triager, not the form dropdown alone. v1 does not cover `feature-small`, `infra`, or `security-sensitive`.

## Task classification

Limits match `docs/operations.md` (CI enforces via `check-diff-size.mjs`).

| Class | Max autonomy | Max LOC | Max files |
|-------|-------------|---------|-----------|
| `docs` | L3 | 60 | 2 |
| `test-fix` | L2 | 120 | 4 |
| `refactor` | L1 | 300 | 8 |
| `feature-small` | L1 | 300 | 8 |
| `dependency-bump` | L1 | 300 | 8 |
| `infra` | L0 | — | human gate |
| `security-sensitive` | L0 | — | proposal only |

## Agent roles

- **triager**: Classify issues, verify CC-SD contract before L1 on docs/test-fix, assign `task:*` and `autonomy:*` labels (read only)
- **implementer**: Execute against Issue CC-SD contract with read/edit/test tools (L1 default)
- **reviewer**: Review PRs for requirement fit and non-goal preservation, no edit permission

## Out of scope (always human)

Production DB operations, production secrets, billing/legal/PII changes.

## Skills

Load `quality-loop` skill when verifying changes against acceptance criteria.
