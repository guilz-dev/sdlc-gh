# Telemetry artifacts

Machine-readable JSON records emitted by inner-loop workflows for nightly outer-loop aggregation. Span-level OTel export remains optional; these artifacts are the **canonical offline source** when Langfuse wiring is absent.

Parent schema fields: [telemetry-schema.md](telemetry-schema.md).

## Envelope shape

Each file is a single JSON object:

| Field | Required | Description |
|-------|----------|-------------|
| `schema_version` | yes | Currently `"1"` |
| `emitted_at` | yes | ISO-8601 timestamp |
| `source` | yes | Emitting workflow id (see table below) |
| `workflow` | best-effort | GitHub Actions workflow name |
| `workflow_run_id` | best-effort | `github.run_id` for correlation |
| `run_attempt` | best-effort | `github.run_attempt` |
| `event_name` | best-effort | `github.event_name` |
| `placeholders` | yes | Payload fields still using sentinel defaults |
| `payload` | yes | Telemetry fields per [telemetry-schema.md](telemetry-schema.md) |

Sample: [infra/samples/telemetry-artifact.json](../infra/samples/telemetry-artifact.json)

## Emitting workflows

| `source` | Workflow | When |
|----------|----------|------|
| `harness-ci` | `.github/workflows/harness-ci.yml` | Every PR after harness jobs complete |
| `eval-ci` | `.github/workflows/eval-ci.yml` | Pull request eval runs only (scheduled runs skip telemetry) |
| `agent-retry-orchestrator` | `.github/workflows/agent-retry-orchestrator.yml` | Failed check suite on a linked PR |
| `pr-context` | `.github/workflows/pr-context-comment.yml` | PR opened / synchronized |

Implementation: `node scripts/emit-telemetry-artifact.mjs` (see `scripts/lib/telemetry-artifact.mjs`).

## Storage and naming

**Runner path:** `telemetry-artifacts/` (repo root during the job).

**Filename:** `{source}-pr{number}-run{workflow_run_id}.json` (or `no-pr` when not PR-scoped).

**GitHub Actions artifact:** each workflow uploads the directory as `harness-telemetry-{run_id}`, `eval-telemetry-{run_id}`, `retry-telemetry-{run_id}`, or `pr-context-telemetry-{run_id}`.

Artifacts are retained per repository retention settings (default 90 days). Nightly aggregation should list workflow runs for the emitters above and download matching artifacts — no PR comment parsing required.

## Required vs best-effort payload fields

| Field | Inner-loop CI | Notes |
|-------|---------------|-------|
| `repo`, `pr_number`, `task_id` | required | `task_id` from linked Issue (`fixes #N`) or `pr-{number}` |
| `task_class`, `autonomy_level`, `retry_count` | required | From PR labels (`task:*`, `autonomy:*`, `retry:N`) |
| `changed_files`, `diff_loc` | required on PR workflows | From `git diff` when `BASE_SHA` is set |
| `wall_failure_type` | required | Empty when green; mapped from failed job names on harness-ci |
| `final_outcome` | required | `in_progress` until merge/close events wire later |
| `agent_type`, `execution_mode`, `model` | best-effort | Sentinel `n/a` / `ci` until agent runtime export |
| `tool_calls`, `cost`, `elapsed_time` | best-effort | Sentinel `-1` until Langfuse / OTel |
| `review_outcome` | best-effort | `pending` until review webhooks exist |

Fields listed in `placeholders` use documented sentinels and are safe for aggregation dashboards to filter.

## Validation

```bash
node scripts/validate-telemetry.mjs "$(cat infra/samples/telemetry-artifact.json)"
node scripts/emit-telemetry-artifact.mjs   # in CI with TELEMETRY_SOURCE set
node scripts/test-telemetry-artifact-scenarios.mjs
```

Set `HARNESS_STRICT_TELEMETRY=1` to fail when `placeholders` is non-empty (intended for post-wiring CI).

## Nightly consumption (outline)

1. Query Actions API for workflow runs of `Harness CI`, `Eval CI`, `Agent retry orchestrator`, and `PR context comment` in the last 24h.
2. Download `*-telemetry-*` artifacts from each run.
3. Parse JSON envelopes; dedupe by `workflow_run_id` + `source` + `payload.pr_number`.
4. Join rows on `repo`, `task_id`, `pr_number` for KPI rollups ([kpi-baseline.md](kpi-baseline.md)).

Classification and harness revision routing are out of scope for the emitters; see [failure-taxonomy.md](failure-taxonomy.md).
