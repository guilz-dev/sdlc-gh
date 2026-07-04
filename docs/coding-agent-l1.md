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

Use `.github/ISSUE_TEMPLATE/task.yml`. CI enforces completeness via the `issue-spec-check` job when the linked Issue has `autonomy:L1` and `task:docs` or `task:test-fix` **labels**. Task Issues sync those labels automatically from the dropdown selections; triager still verifies that the classification is correct before delegation.

**No usable CC-SD contract, no L1 delegation** — triager must not apply `autonomy:L1` if fields are blank or placeholder-only.

`issue-spec-check` fails on fetch errors only when PR or Issue labels indicate L1 `docs`/`test-fix`; otherwise it warns and skips.

Task Issues created from `.github/ISSUE_TEMPLATE/task.yml` now sync `task:*` and `autonomy:*` labels automatically from the dropdown selections via [task-issue-label-sync.yml](../.github/workflows/task-issue-label-sync.yml). Triager still owns the classification decision, but no longer has to retype the same values into labels.

## CC-SD examples

### Good example: `task:docs`

```md
Goal
Refresh the README readiness section so first-time adopters can find the L1 workflow and know when to use it.

Non-goals
- Do not change workflow behavior or required checks.
- Do not rewrite unrelated setup sections.

Constraints
- Limit edits to README.md and docs/coding-agent-l1.md.
- Keep terminology aligned with docs/operations.md and workflow names.

Acceptance criteria
- [ ] README links to the L1 readiness workflow from the readiness section.
- [ ] docs/coding-agent-l1.md mentions the Actions-based fallback.
- [ ] No other docs are required to understand how to start the check.

Rollback hints
Revert the README/docs commit if the wording causes confusion; no data migration or config rollback is required.
```

### Good example: `task:test-fix`

```md
Goal
Fix the failing readiness scenario test so strict mode expectations match the current CLI output.

Non-goals
- Do not change production workflow permissions.
- Do not refactor unrelated doctor or diff-size checks.

Constraints
- Edit only the readiness test and the minimal supporting helper if needed.
- Preserve current status vocabulary unless a test proves it is wrong.

Acceptance criteria
- [ ] The targeted readiness scenario reproduces the original failure before the fix.
- [ ] `node scripts/test-l1-readiness-scenarios.mjs` passes after the fix.
- [ ] The fix does not weaken existing failure coverage.

Rollback hints
Revert the test/helper commit and re-run the scenario suite.
```

### Bad example: rejected placeholder-only contract

```md
Goal
Update docs.

Non-goals
- None

Constraints
- Keep it simple

Acceptance criteria
- [ ] Works

Rollback hints
Revert if needed
```

This should be rejected for L1 because the contract does not bound scope or define testable acceptance criteria.

## L1 flow

1. Author fills CC-SD Issue
2. Triager validates the contract and confirms or corrects the synced labels
3. Implementer executes against the contract
4. CI enforces spec completeness (`issue-spec-check`)
5. Reviewer checks spec conformance (requirement fit + non-goal preservation)

## Agent assignment

1. Assign **triager** to classify and confirm the synced labels (or add labels manually if sync did not run)
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

Without local Node/gh, use **Actions → L1 readiness check → Run workflow** (`.github/workflows/l1-readiness-check.yml`). The workflow uses `GITHUB_TOKEN` for remote checks and writes a markdown job summary.

What it verifies:

- local harness assets and doctor checks (stack inferred from `product-ci-*.yml` when `.harness-stack` is absent)
- Issue template and agent files required for L1 delegation
- labels/rulesets/workflow status on GitHub when `gh` is authenticated (or via the Actions workflow)
- unresolved manual prerequisites (for example Copilot coding agent entitlement)

Status vocabulary is `PASS` / `FAIL` / `SKIP` / `WARN` / `MANUAL`. `--strict` uses the `check-l1-readiness` CLI's strict gating semantics.

## Success criteria

- Draft PR passes all required checks
- Harness context comment posted on PR
- Human merges after review
