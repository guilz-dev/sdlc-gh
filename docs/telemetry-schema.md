# Telemetry Schema

Minimum structured fields for agent harness observability (arch.md §5.4). Export via OpenTelemetry to Langfuse or any OTel-compatible backend.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Unique task identifier (Issue number or UUID) |
| `pr_number` | integer | Pull request number, if applicable |
| `repo` | string | `owner/name` |
| `agent_type` | string | e.g. `implementer`, `triager`, `reviewer` |
| `execution_mode` | string | `cli`, `ide`, `coding_agent`, `gh_aw`, `sdk` |
| `model` | string | Model identifier used |
| `task_class` | string | `docs`, `test-fix`, `refactor`, etc. |
| `autonomy_level` | string | `L0`–`L3` |
| `tool_calls` | integer | Count of tool invocations |
| `retry_count` | integer | Inner-loop retry attempts |
| `wall_failure_type` | string | `test`, `lint`, `type`, `security`, `safe-output`, `diff-size`, or empty |
| `cost` | number | AI credits or token cost |
| `elapsed_time` | number | Seconds |
| `changed_files` | integer | Files in diff |
| `diff_loc` | integer | Lines changed (add + delete) |
| `final_outcome` | string | `merged`, `closed`, `escalated`, `in_progress` |
| `review_outcome` | string | `approved`, `changes_requested`, `pending` |

## KPI mapping

| KPI | Fields |
|-----|--------|
| PR rejection rate | `review_outcome`, `final_outcome` |
| First-pass wall rate | `wall_failure_type`, `retry_count` |
| Cost per task | `cost`, `task_id` |
| Autonomy distribution | `autonomy_level`, `task_class` |
| Adoption rate | `review_outcome`, `task_class` |

## Validation

Collector or `scripts/validate-telemetry.mjs` should reject spans missing required fields when `HARNESS_STRICT_TELEMETRY=1`.
