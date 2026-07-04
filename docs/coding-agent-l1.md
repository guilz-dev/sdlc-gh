# Coding agent L1 trial guide

Start Issue-driven delegation with low-risk task classes only.

## Eligible tasks

| Label | Description |
|-------|-------------|
| `task:docs` | Documentation, comments, README |
| `task:test-fix` | Fix or add tests (single responsibility) |

Always set `autonomy:L1` unless triager recommends lower.

`task:feature-small`, `task:infra`, and `task:security-sensitive` are **out of scope** for CC-SD enforcement in v1.

## CC-SD contract (required for L1 docs / test-fix)

L1 delegation on `task:docs` and `task:test-fix` requires a complete Issue-embedded CC-SD contract:

| Field | Required |
|-------|----------|
| `Goal` | yes |
| `Non-goals` | yes |
| `Constraints` | yes |
| `Acceptance criteria` | yes |
| `Rollback hints` | yes |
| `Additional context` | optional |

Use `.github/ISSUE_TEMPLATE/task.yml`. CI enforces completeness via the `issue-spec-check` job when the linked Issue has `autonomy:L1` and `task:docs` or `task:test-fix` **labels** (triager must apply labels — the form dropdown alone does not trigger enforcement).

**No usable CC-SD contract, no L1 delegation** — triager must not apply `autonomy:L1` if fields are blank or placeholder-only.

`issue-spec-check` fails on fetch errors only when PR or Issue labels indicate L1 `docs`/`test-fix`; otherwise it warns and skips.

## L1 flow

1. Author fills CC-SD Issue
2. Triager validates contract and applies labels
3. Implementer executes against the contract
4. CI enforces spec completeness (`issue-spec-check`)
5. Reviewer checks spec conformance (requirement fit + non-goal preservation)

## Agent assignment

1. Assign **triager** to classify (or add labels manually)
2. Assign **implementer** for L1 tasks with a complete contract
3. Agent opens draft PR; human reviews at single gate

## Prerequisites

- GitHub Copilot with coding agent enabled
- Copilot setup workflow green
- Ruleset: `harness-static`, `diff-size`, `issue-spec-check` (for L1 repos), stack `product-ci-*`

## Readiness check (recommended)

Run before creating the first L1 Issue:

```bash
npm run check-l1-readiness
npm run check-l1-readiness -- --strict
```

Direct script form is also available: `node scripts/check-l1-readiness.mjs --strict`.

What it verifies:

- local harness assets and doctor checks
- Issue template and agent files required for L1 delegation
- labels/rulesets/workflow status on GitHub when `gh` is authenticated
- unresolved manual prerequisites (for example Copilot coding agent entitlement)

## Success criteria

- Draft PR passes all required checks
- Harness context comment posted on PR
- Human merges after review
