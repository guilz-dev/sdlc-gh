# Agent Harness — Project Instructions

## Purpose

This repository (or a product repo using this harness) follows the agent harness architecture in `docs/arch.md`. Human judgment converges on **PR review only**.

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

- **triager**: Classify issues, assign `task:*` and `autonomy:*` labels (read only)
- **implementer**: Implement with read/edit/test tools (L1 default)
- **reviewer**: Review PRs, no edit permission

## Out of scope (always human)

Production DB operations, production secrets, billing/legal/PII changes.

## Skills

Load `quality-loop` skill when verifying changes against acceptance criteria.
