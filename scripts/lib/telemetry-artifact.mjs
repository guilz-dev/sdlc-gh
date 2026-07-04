/**
 * Canonical telemetry artifact shape for inner-loop workflows.
 * See docs/telemetry-schema.md and docs/telemetry-artifacts.md.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { extractClosingIssueNumbers } from "./ccsd-contract.mjs";
import { aggregateDiffStats, parseLabelInput, resolveAutonomyLevel } from "./diff-size.mjs";

export const TELEMETRY_SCHEMA_VERSION = "1";
export const ARTIFACT_DIR = "telemetry-artifacts";

/** Required payload fields per docs/telemetry-schema.md */
export const TELEMETRY_REQUIRED_FIELDS = [
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

/** Fields commonly unavailable until Langfuse / agent runtime wiring exists */
export const TELEMETRY_BEST_EFFORT_FIELDS = [
  "agent_type",
  "execution_mode",
  "model",
  "tool_calls",
  "cost",
  "elapsed_time",
  "review_outcome",
];

const WALL_FAILURE_PATTERNS = [
  [/diff[- ]?size/i, "diff-size"],
  [/issue[- ]?spec/i, "lint"],
  [/zizmor|codeql|security/i, "security"],
  [/safe[- ]?output/i, "safe-output"],
  [/product-ci/i, "test"],
  [/type(check)?/i, "type"],
  [/lint/i, "lint"],
  [/test/i, "test"],
];

const PLACEHOLDER_DEFAULTS = {
  agent_type: "n/a",
  execution_mode: "ci",
  model: "n/a",
  task_class: "unknown",
  autonomy_level: "L1",
  tool_calls: -1,
  retry_count: 0,
  wall_failure_type: "",
  cost: -1,
  elapsed_time: -1,
  changed_files: 0,
  diff_loc: 0,
  final_outcome: "in_progress",
  review_outcome: "pending",
};

/**
 * @param {string} input
 * @returns {string}
 */
export function resolveTaskClass(labels) {
  const taskLabel = labels.find((l) => l.startsWith("task:"));
  return taskLabel ? taskLabel.replace(/^task:/, "") : PLACEHOLDER_DEFAULTS.task_class;
}

/**
 * @param {string} input
 * @returns {number}
 */
export function resolveRetryCount(labels) {
  const retryLabel = labels.find((l) => l.startsWith("retry:"));
  if (!retryLabel) return 0;
  const count = parseInt(retryLabel.split(":")[1], 10);
  return Number.isFinite(count) ? count : 0;
}

/**
 * @param {string | number | undefined | null} prBody
 * @param {number} prNumber
 * @returns {string}
 */
export function resolveTaskId(prBody, prNumber) {
  const linked = extractClosingIssueNumbers(String(prBody || ""));
  if (linked.length === 1) return String(linked[0]);
  if (linked.length > 1) return String(linked[0]);
  if (prNumber) return `pr-${prNumber}`;
  return "unknown";
}

/**
 * Map failed CI job / check names to telemetry wall_failure_type.
 * @param {string} name
 * @returns {string}
 */
export function mapNameToWallFailureType(name) {
  const text = String(name || "");
  if (!text) return "";
  for (const [pattern, wallType] of WALL_FAILURE_PATTERNS) {
    if (pattern.test(text)) return wallType;
  }
  return "";
}

/**
 * @param {Record<string, { result?: string }>} jobResults
 * @returns {string}
 */
export function wallFailureTypeFromJobResults(jobResults = {}) {
  const failed = Object.entries(jobResults)
    .filter(([, job]) => job?.result === "failure")
    .map(([name]) => name);

  for (const name of failed) {
    const mapped = mapNameToWallFailureType(name);
    if (mapped) return mapped;
  }
  return failed.length ? mapNameToWallFailureType(failed[0]) || "test" : "";
}

/**
 * @param {Record<string, unknown>} overrides
 * @returns {{ payload: Record<string, unknown>, placeholders: string[] }}
 */
export function buildTelemetryPayload(overrides = {}) {
  const labels = parseLabelInput(overrides.labels ?? overrides.PR_LABELS ?? "");
  const prNumber = Number(overrides.pr_number ?? overrides.PR_NUMBER ?? 0) || 0;
  const prBody = overrides.pr_body ?? overrides.PR_BODY ?? "";

  const payload = {
    task_id: resolveTaskId(prBody, prNumber),
    pr_number: prNumber,
    repo: String(overrides.repo ?? overrides.GITHUB_REPOSITORY ?? "unknown/unknown"),
    agent_type: String(overrides.agent_type ?? PLACEHOLDER_DEFAULTS.agent_type),
    execution_mode: String(overrides.execution_mode ?? PLACEHOLDER_DEFAULTS.execution_mode),
    model: String(overrides.model ?? PLACEHOLDER_DEFAULTS.model),
    task_class: String(overrides.task_class ?? resolveTaskClass(labels)),
    autonomy_level: String(
      overrides.autonomy_level ?? resolveAutonomyLevel(labels) ?? PLACEHOLDER_DEFAULTS.autonomy_level,
    ),
    tool_calls: Number(overrides.tool_calls ?? PLACEHOLDER_DEFAULTS.tool_calls),
    retry_count: Number(
      overrides.retry_count ?? resolveRetryCount(labels) ?? PLACEHOLDER_DEFAULTS.retry_count,
    ),
    wall_failure_type: String(
      overrides.wall_failure_type ?? overrides.WALL_FAILURE_TYPE ?? PLACEHOLDER_DEFAULTS.wall_failure_type,
    ),
    cost: Number(overrides.cost ?? PLACEHOLDER_DEFAULTS.cost),
    elapsed_time: Number(overrides.elapsed_time ?? PLACEHOLDER_DEFAULTS.elapsed_time),
    changed_files: Number(overrides.changed_files ?? PLACEHOLDER_DEFAULTS.changed_files),
    diff_loc: Number(overrides.diff_loc ?? PLACEHOLDER_DEFAULTS.diff_loc),
    final_outcome: String(overrides.final_outcome ?? PLACEHOLDER_DEFAULTS.final_outcome),
    review_outcome: String(overrides.review_outcome ?? PLACEHOLDER_DEFAULTS.review_outcome),
  };

  const placeholders = TELEMETRY_BEST_EFFORT_FIELDS.filter((field) => {
    if (overrides[field] !== undefined && overrides[field] !== null) return false;
    const upper = field.toUpperCase();
    if (overrides[upper] !== undefined && overrides[upper] !== null) return false;
    return true;
  });

  return { payload, placeholders };
}

/**
 * @param {Record<string, unknown>} options
 * @returns {Record<string, unknown>}
 */
export function buildTelemetryArtifact(options = {}) {
  const { payload, placeholders } = buildTelemetryPayload(options);
  return {
    schema_version: TELEMETRY_SCHEMA_VERSION,
    emitted_at: new Date().toISOString(),
    source: String(options.source ?? options.TELEMETRY_SOURCE ?? "unknown"),
    workflow: options.workflow ?? options.GITHUB_WORKFLOW ?? null,
    workflow_run_id: Number(options.workflow_run_id ?? options.GITHUB_RUN_ID ?? 0) || null,
    run_attempt: Number(options.run_attempt ?? options.GITHUB_RUN_ATTEMPT ?? 1) || 1,
    event_name: options.event_name ?? options.GITHUB_EVENT_NAME ?? null,
    placeholders,
    payload,
  };
}

/**
 * @param {{ source: string, prNumber?: number, workflowRunId?: number | string }} params
 * @returns {string}
 */
export function artifactFilename({ source, prNumber = 0, workflowRunId = 0 }) {
  const safeSource = String(source).replace(/[^a-z0-9-]+/gi, "-");
  const prPart = prNumber ? `pr${prNumber}` : "no-pr";
  return `${safeSource}-${prPart}-run${workflowRunId}.json`;
}

/**
 * @param {Record<string, unknown>} artifact
 * @param {{ outDir?: string, filename?: string }} [opts]
 * @returns {string} absolute path written
 */
export function writeTelemetryArtifact(artifact, opts = {}) {
  const outDir = opts.outDir ?? ARTIFACT_DIR;
  mkdirSync(outDir, { recursive: true });
  const filename =
    opts.filename ??
    artifactFilename({
      source: artifact.source,
      prNumber: artifact.payload?.pr_number,
      workflowRunId: artifact.workflow_run_id,
    });
  const path = join(outDir, filename);
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return path;
}

/**
 * @param {string} baseRef e.g. origin/main
 * @returns {{ changed_files: number, diff_loc: number }}
 */
export function diffStatsFromGit(baseRef = "origin/main") {
  const range = `${baseRef}...HEAD`;
  try {
    const numstat = execSync(`git diff --numstat ${range}`, { encoding: "utf8" });
    const stats = aggregateDiffStats(numstat);
    return { changed_files: stats.files, diff_loc: stats.loc };
  } catch {
    return { changed_files: 0, diff_loc: 0 };
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string[]}
 */
export function missingRequiredFields(payload) {
  return TELEMETRY_REQUIRED_FIELDS.filter((key) => payload[key] === undefined || payload[key] === null);
}
