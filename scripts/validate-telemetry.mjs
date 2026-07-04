#!/usr/bin/env node
/** Validate telemetry payload against docs/telemetry-schema.md required fields */
const REQUIRED = [
  "task_id",
  "pr_number",
  "repo",
  "agent_type",
  "execution_mode",
  "model",
  "task_class",
  "autonomy_level",
  "tool_calls",
  "retry_count",
  "wall_failure_type",
  "cost",
  "elapsed_time",
  "changed_files",
  "diff_loc",
  "final_outcome",
  "review_outcome",
];

const payload = JSON.parse(process.argv[2] || "{}");
const missing = REQUIRED.filter((k) => payload[k] === undefined || payload[k] === null);
if (missing.length) {
  console.error("Missing telemetry fields:", missing.join(", "));
  process.exit(1);
}
console.log("Telemetry payload valid");
