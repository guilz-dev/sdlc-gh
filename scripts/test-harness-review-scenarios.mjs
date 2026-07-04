#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildHarnessReviewSummary,
  classifyTaskGroup,
  dedupeTelemetryRecords,
  formatHarnessReviewMarkdown,
} from "./lib/harness-review.mjs";

function artifact(overrides) {
  const payload = {
    task_id: "42",
    pr_number: 101,
    repo: "org/product",
    task_class: "docs",
    autonomy_level: "L1",
    retry_count: 0,
    wall_failure_type: "",
    final_outcome: "in_progress",
    review_outcome: "pending",
    ...overrides.payload,
  };
  return {
    schema_version: "1",
    emitted_at: overrides.emitted_at ?? "2026-07-04T12:00:00.000Z",
    source: overrides.source ?? "harness-ci",
    workflow_run_id: overrides.workflow_run_id ?? 1,
    payload,
  };
}

const deduped = dedupeTelemetryRecords([
  artifact({ workflow_run_id: 1, source: "harness-ci" }),
  artifact({ workflow_run_id: 1, source: "harness-ci", emitted_at: "2026-07-04T13:00:00.000Z" }),
  artifact({ workflow_run_id: 2, source: "harness-ci", payload: { pr_number: 102 } }),
]);
assert.equal(deduped.length, 2);

const modelLimit = classifyTaskGroup([
  artifact({
    source: "agent-retry-orchestrator",
    payload: { retry_count: 3, wall_failure_type: "test", final_outcome: "escalated" },
  }),
]);
assert.equal(modelLimit?.classification, "モデル限界");

const wallGap = classifyTaskGroup([
  artifact({ source: "harness-ci", payload: { wall_failure_type: "" } }),
  artifact({
    source: "pr-context",
    payload: { review_outcome: "changes_requested", wall_failure_type: "" },
  }),
]);
assert.equal(wallGap?.classification, "壁不足");

const ffGap = classifyTaskGroup([
  artifact({ workflow_run_id: 10, source: "harness-ci", payload: { wall_failure_type: "lint" } }),
  artifact({
    workflow_run_id: 11,
    source: "agent-retry-orchestrator",
    payload: { wall_failure_type: "lint", retry_count: 1 },
  }),
]);
assert.equal(ffGap?.classification, "FF不足");

const repeatedTest = classifyTaskGroup([
  artifact({ workflow_run_id: 20, source: "harness-ci", payload: { wall_failure_type: "test" } }),
  artifact({ workflow_run_id: 21, source: "harness-ci", payload: { wall_failure_type: "test" } }),
]);
assert.equal(repeatedTest?.classification, "モデル限界");

const summary = buildHarnessReviewSummary([
  artifact({
    source: "agent-retry-orchestrator",
    payload: { retry_count: 3, wall_failure_type: "test", final_outcome: "escalated" },
  }),
  artifact({
    source: "harness-ci",
    payload: { pr_number: 200, task_id: "55", wall_failure_type: "" },
  }),
  artifact({
    source: "pr-context",
    payload: { pr_number: 200, task_id: "55", review_outcome: "changes_requested" },
  }),
]);
assert.equal(summary.rollup.failure_groups, 2);
assert.equal(summary.rollup.by_classification["モデル限界"], 1);
assert.equal(summary.rollup.by_classification["壁不足"], 1);
assert.match(formatHarnessReviewMarkdown(summary), /Nightly harness review/);
assert.ok(Array.isArray(summary.rollup.repeated_failure_signatures));

console.log("harness-review scenarios ok");
