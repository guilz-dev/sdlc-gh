# Coding agent L1 trial guide

Start Issue-driven delegation with low-risk task classes only.

## Eligible tasks

| Label | Description |
|-------|-------------|
| `task:docs` | Documentation, comments, README |
| `task:test-fix` | Fix or add tests (single responsibility) |

Always set `autonomy:L1` unless triager recommends lower.

## Issue template

Use `.github/ISSUE_TEMPLATE/task.yml` with acceptance criteria checkboxes.

## Agent assignment

1. Assign **triager** to classify (or add labels manually)
2. Assign **implementer** for L1 tasks
3. Agent opens draft PR; human reviews at single gate

## Prerequisites

- GitHub Copilot with coding agent enabled
- Copilot setup workflow green
- Ruleset: `harness-static`, `diff-size`, stack `product-ci-*`

## Success criteria

- Draft PR passes all required checks
- Harness context comment posted on PR
- Human merges after review
