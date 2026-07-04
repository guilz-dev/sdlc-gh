# Nightly harness review

Standard GitHub Actions outer-loop job that aggregates inner-loop telemetry artifacts (#2) and classifies failures per [failure-taxonomy.md](failure-taxonomy.md). Runs **without gh-aw**.

## Workflow

| Item | Value |
|------|-------|
| File | `.github/workflows/nightly-harness-review.yml` |
| Schedule | `0 2 * * *` (02:00 UTC daily) |
| Manual | `workflow_dispatch` with optional `window_hours` (default 24); routing is **dry-run by default** unless `apply_routing=true` |

gh-aw stub (`.github/workflows/nightly-harness-review.md` + `.lock.yml`) documents promotion criteria and safe-outputs; **GHA** [nightly-harness-review.yml](../.github/workflows/nightly-harness-review.yml) is the operational baseline.

## Pipeline

1. `scripts/fetch-telemetry-artifacts.mjs` — list recent runs for emitter workflows, download `*-telemetry-*` artifacts into `telemetry-collected/`
2. `scripts/aggregate-harness-review.mjs` — dedupe, group by `repo` + `task_id` + `pr_number`, classify, write summaries

Emitter workflows: see [telemetry-artifacts.md](telemetry-artifacts.md).

## Output

| Path | Format |
|------|--------|
| `harness-review/harness-review-summary.json` | Machine-readable rollup + per-task `classifications[]` |
| `harness-review/harness-review-summary.md` | Human-readable tables for the morning queue |
| GitHub Actions step summary | Same Markdown as above |
| Artifact `nightly-harness-review-{run_id}` | Uploaded directory for downstream automation |

Sample JSON: [infra/samples/harness-review-summary.json](../infra/samples/harness-review-summary.json)

## Classification rules

| Class | Signals |
|-------|---------|
| **壁不足** | Harness CI green (`wall_failure_type` empty) + `review_outcome: changes_requested` |
| **モデル限界** | `final_outcome: escalated`, `retry_count >= 3`, security wall, repeated `test`/`type`/etc., or same wall across multiple retry events |
| **FF不足** | Repeated `lint` / issue-spec failures (≥2 records) |
| **unclassified** | Failure present but pattern does not match above |

`rollup.repeated_failure_signatures` lists `wall_failure_type` values seen on ≥2 records or ≥2 tasks. `by_wall_failure_type` counts **task groups** per wall type (not raw telemetry rows).

## Local dry-run

With fixture telemetry JSON under `telemetry-collected/`:

```bash
node scripts/aggregate-harness-review.mjs
cat harness-review/harness-review-summary.md
```

Fetch from GitHub (requires `gh` + token):

```bash
export GH_TOKEN=...
export GITHUB_REPOSITORY=owner/repo
node scripts/fetch-telemetry-artifacts.mjs
node scripts/aggregate-harness-review.mjs
```

## Tests

```bash
node scripts/test-harness-review-scenarios.mjs
node scripts/test-harness-review-routing-scenarios.mjs
```

## Follow-up automation

The JSON summary feeds `scripts/route-harness-review.mjs` (#4), which opens or updates GitHub issues when thresholds are met.

## Issue routing

| Classification | Threshold | Issue kind | Labels |
|----------------|-----------|------------|--------|
| **FF不足** | ≥2 task groups **or** repeated `lint` signature (`record_count >= 2`) | harness-revision | `outer-loop:harness-revision`, `autonomy:L0` |
| **壁不足** | ≥2 task groups **or** CI-pass + review-reject proxy | wall-addition | `outer-loop:wall-addition`, `autonomy:L0` |

Dedupe: HTML comment marker `<!-- harness-routing-key: {repo}:{kind}:{signature}:{scope} -->` in the issue body. `scope` is derived from task class and wall types where available, so unrelated findings do not collapse into one repo-wide issue. Existing open issues with the same key are **updated**, not duplicated.

**Migration:** keys before scope suffix (`{repo}:{kind}:{signature}`) are not matched automatically. Close or relabel legacy routed issues after upgrading, or accept one duplicate cycle before the new keys stabilize.

Dry-run locally:

```bash
node scripts/aggregate-harness-review.mjs
HARNESS_ROUTING_DRY_RUN=1 node scripts/route-harness-review.mjs
cat harness-review/harness-review-routing-plan.json
```

Outputs also written to `harness-review/harness-review-routing-results.json` when live.

Non-goals: automatic code changes, proposal PR creation (issues only), Langfuse dependency, weekly red-team.
