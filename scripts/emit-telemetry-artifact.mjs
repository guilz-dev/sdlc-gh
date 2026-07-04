#!/usr/bin/env node
/**
 * Emit a machine-readable telemetry artifact for inner-loop workflows.
 * Workflows set TELEMETRY_SOURCE and context env vars, then upload telemetry-artifacts/.
 */
import {
  buildTelemetryArtifact,
  diffStatsFromGit,
  mapNameToWallFailureType,
  missingRequiredFields,
  wallFailureTypeFromJobResults,
  writeTelemetryArtifact,
} from "./lib/telemetry-artifact.mjs";

function parseJobResults(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function main() {
  const source = process.env.TELEMETRY_SOURCE;
  if (!source) {
    console.error("::error::TELEMETRY_SOURCE is required");
    process.exit(1);
  }

  const prNumber = Number(process.env.PR_NUMBER || 0) || 0;
  const skipWithoutPr = process.env.TELEMETRY_SKIP_WITHOUT_PR === "1";
  if (skipWithoutPr && !prNumber) {
    console.log("No PR context; skipping telemetry artifact");
    return;
  }

  const overrides = {
    source,
    TELEMETRY_SOURCE: source,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
    GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT,
    GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
    GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
    PR_NUMBER: prNumber,
    PR_BODY: process.env.PR_BODY,
    PR_LABELS: process.env.PR_LABELS,
    agent_type: process.env.AGENT_TYPE,
    execution_mode: process.env.EXECUTION_MODE,
    model: process.env.MODEL,
    task_class: process.env.TASK_CLASS,
    autonomy_level: process.env.AUTONOMY_LEVEL,
    tool_calls: process.env.TOOL_CALLS,
    retry_count: process.env.RETRY_COUNT,
    wall_failure_type: process.env.WALL_FAILURE_TYPE,
    cost: process.env.COST,
    elapsed_time: process.env.ELAPSED_TIME,
    changed_files: process.env.CHANGED_FILES,
    diff_loc: process.env.DIFF_LOC,
    final_outcome: process.env.FINAL_OUTCOME,
    review_outcome: process.env.REVIEW_OUTCOME,
  };

  if (!process.env.CHANGED_FILES && !process.env.DIFF_LOC && process.env.BASE_SHA) {
    const stats = diffStatsFromGit(process.env.BASE_SHA);
    overrides.changed_files = stats.changed_files;
    overrides.diff_loc = stats.diff_loc;
  }

  if (!process.env.WALL_FAILURE_TYPE && process.env.JOB_RESULTS) {
    const wallType = wallFailureTypeFromJobResults(parseJobResults(process.env.JOB_RESULTS));
    if (wallType) overrides.wall_failure_type = wallType;
  } else if (process.env.WALL_FAILURE_TYPE) {
    const mapped = mapNameToWallFailureType(process.env.WALL_FAILURE_TYPE);
    overrides.wall_failure_type = mapped || process.env.WALL_FAILURE_TYPE;
  }

  const artifact = buildTelemetryArtifact(overrides);
  const missing = missingRequiredFields(artifact.payload);
  if (missing.length) {
    console.error(`::error::Telemetry payload missing fields: ${missing.join(", ")}`);
    process.exit(1);
  }

  const strict = process.env.HARNESS_STRICT_TELEMETRY === "1";
  if (strict && artifact.placeholders.length) {
    console.error(
      `::error::Strict telemetry: unresolved placeholders: ${artifact.placeholders.join(", ")}`,
    );
    process.exit(1);
  }

  const path = writeTelemetryArtifact(artifact);
  console.log(`Wrote telemetry artifact: ${path}`);
  console.log(`::notice::telemetry_placeholders=${artifact.placeholders.join(",") || "none"}`);
}

main();
