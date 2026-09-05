---
description: Nightly harness review — classify failures and propose harness revisions.
name: Nightly harness review
imports:
  - ../aw/shared/policy-guards.md
  - ../aw/shared/taxonomy.md
on:
  workflow_dispatch:
  roles:
    - admin
    - maintainer
    - write
  stop-after: 2027-01-01
  permissions:
    actions: read
    contents: read
  steps:
    - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
      with:
        node-version: "22"
    - name: Fetch telemetry artifacts
      env:
        GH_TOKEN: ${{ github.token }}
        GITHUB_REPOSITORY: ${{ github.repository }}
        WINDOW_HOURS: "24"
        TELEMETRY_COLLECT_DIR: telemetry-collected
      run: node scripts/fetch-telemetry-artifacts.mjs
    - name: Aggregate and classify failures
      env:
        GITHUB_REPOSITORY: ${{ github.repository }}
        WINDOW_HOURS: "24"
        TELEMETRY_COLLECT_DIR: telemetry-collected
        HARNESS_REVIEW_OUT_DIR: harness-review
      run: node scripts/aggregate-harness-review.mjs
    - name: Stage prepared inputs for agent
      run: |
        mkdir -p /tmp/gh-aw/base
        rm -rf /tmp/gh-aw/base/telemetry-collected /tmp/gh-aw/base/harness-review
        cp -R telemetry-collected /tmp/gh-aw/base/telemetry-collected
        cp -R harness-review /tmp/gh-aw/base/harness-review
permissions:
  contents: read
  actions: read
  issues: read
engine:
  id: copilot
  model: claude-sonnet-4.6
network:
  allowed:
    - defaults
    - github
timeout-minutes: 20
max-ai-credits: 500
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
| Prepared telemetry workspace | `/tmp/gh-aw/base/telemetry-collected/` staged by deterministic `on.steps` | yes |
| Prepared harness review summary | `/tmp/gh-aw/base/harness-review/harness-review-summary.json` staged by deterministic `on.steps` | yes |
| Failure taxonomy | [docs/failure-taxonomy.md](../../docs/failure-taxonomy.md) | yes |
| Aggregation window | Fixed 24h to match the current GHA baseline | yes |

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

Until then, treat this file as the **specification** and GHA as the **runtime**. This source stays `workflow_dispatch`-only while dogfood is active.

## Agent instructions

Analyze failure traces per [docs/failure-taxonomy.md](../../docs/failure-taxonomy.md).

Read `/tmp/gh-aw/base/harness-review/harness-review-summary.json` and supporting files under `/tmp/gh-aw/base/telemetry-collected/` that were staged by deterministic `on.steps`. Do **not** fetch artifacts or re-run aggregation from inside the agent.

When repeated **FF不足** or **壁不足** patterns appear in the summary JSON, ensure routed issues exist (GHA runs `scripts/route-harness-review.mjs`) or propose a harness revision PR with eval / instruction diffs only.

Do not auto-merge. Prefer proposal-only PRs at `autonomy:L0`.
