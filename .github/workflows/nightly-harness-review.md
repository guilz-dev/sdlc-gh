---
description: Nightly harness review — classify failures and propose harness revisions.
name: Nightly harness review
on:
  schedule:
    - cron: "0 2 * * *"
permissions:
  contents: read
  issues: read
safe-outputs:
  create-pull-request:
    max: 1
  create-issue:
    max: 3
---

# Nightly harness review (gh-aw source)

> **Operational baseline:** [nightly-harness-review.yml](./nightly-harness-review.yml) runs on standard GitHub Actions without gh-aw. Use this Markdown source only when promoting to gh-aw per [docs/gh-aw-dogfood.md](../../docs/gh-aw-dogfood.md).

## Required inputs

| Input | Source | Required |
|-------|--------|----------|
| Telemetry JSON artifacts | Inner-loop workflows (`harness-ci`, `eval-ci`, retry, PR context) | yes |
| Aggregation window | Default 24h; match GHA `WINDOW_HOURS` | yes |
| Failure taxonomy | [docs/failure-taxonomy.md](../../docs/failure-taxonomy.md) | yes |
| Harness review summary | `harness-review/harness-review-summary.json` from GHA aggregator | yes when chaining |

## Forbidden operations

- Do **not** auto-merge pull requests
- Do **not** modify product application code outside harness paths
- Do **not** disable CI walls or bypass `safe-output` limits
- Do **not** replace the GHA nightly job without dogfood criteria green

## Expected outputs

| Output | Format | Limit |
|--------|--------|-------|
| Harness revision proposal | Pull request (`autonomy:L0`) | `create-pull-request.max: 1` |
| Routed work items | GitHub issues with dedupe markers | `create-issue.max: 3` |
| Human summary | Markdown tables in step summary / artifact | reviewable text only |

Issue routing rules (GHA implementation): [docs/nightly-harness-review.md](../../docs/nightly-harness-review.md#issue-routing).

## Classification contract

Classify each task group into one of:

- **FF不足** — repeated convention / lint / issue-spec gaps → harness revision
- **壁不足** — CI green but review rejects → add walls (tests, lint, contracts)
- **モデル限界** — retry exhaustion or repeated execution failures → escalate / split task

Use `rollup.repeated_failure_signatures` and per-task `classifications[]` from the summary JSON schema (`scripts/lib/harness-review.mjs`).

## Escalation

Escalate to humans (issue comment or `create-issue`) when:

- `classification` is `モデル限界` with security `wall_failure_type`
- the same `harness-routing-key` fires three nightly windows in a row without resolution
- gh-aw compile or safe-output validation fails on this source

## Fallback when gh-aw regresses

1. Keep **GHA** [nightly-harness-review.yml](./nightly-harness-review.yml) as the operational outer loop
2. Revert `.md` / `.lock.yml` pair per [docs/revert-playbook.md](../../docs/revert-playbook.md)
3. Record incident in dogfood report artifact (`docs/gh-aw-dogfood.md`)

## Promotion criteria (gh-aw vs GHA)

Promote gh-aw execution only when **all** hold:

- Dogfood CI green for ≥3 consecutive runs on unchanged `.md` sources
- GHA nightly review and gh-aw classification outputs agree on fixture summaries
- `create-pull-request.max` remains `1` and no forbidden safe-outputs appear

Until then, treat this file as the **specification** and GHA as the **runtime**.

## Agent instructions

Analyze failure traces per [docs/failure-taxonomy.md](../../docs/failure-taxonomy.md).

When repeated **FF不足** or **壁不足** patterns appear in the summary JSON, ensure routed issues exist (GHA runs `scripts/route-harness-review.mjs`) or propose a harness revision PR with eval / instruction diffs only.

Do not auto-merge. Prefer proposal-only PRs at `autonomy:L0`.
