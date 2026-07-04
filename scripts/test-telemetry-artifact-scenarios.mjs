#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  artifactFilename,
  buildTelemetryArtifact,
  buildTelemetryPayload,
  mapNameToWallFailureType,
  missingRequiredFields,
  resolveRetryCount,
  resolveTaskClass,
  resolveTaskId,
  wallFailureTypeFromJobResults,
} from "./lib/telemetry-artifact.mjs";
import { patchHarnessCi, stacksForHarness } from "./lib/harness-ci-fragments.mjs";

const base = buildTelemetryPayload({
  repo: "org/repo",
  pr_number: 42,
  pr_body: "fixes #7",
  labels: "task:docs,autonomy:L2,retry:2",
  wall_failure_type: "diff-size",
});

assert.equal(base.payload.task_id, "7");
assert.equal(base.payload.task_class, "docs");
assert.equal(base.payload.autonomy_level, "L2");
assert.equal(base.payload.retry_count, 2);
assert.equal(base.payload.wall_failure_type, "diff-size");
assert.equal(missingRequiredFields(base.payload).length, 0);
assert.ok(base.placeholders.includes("model"));

assert.equal(resolveTaskId("", 99), "pr-99");
assert.equal(resolveTaskClass(["task:test-fix"]), "test-fix");
assert.equal(resolveRetryCount(["retry:3"]), 3);
assert.equal(mapNameToWallFailureType("diff-size"), "diff-size");
assert.equal(mapNameToWallFailureType("product-ci-ts"), "test");
assert.equal(
  wallFailureTypeFromJobResults({
    "diff-size": { result: "failure" },
    "harness-static": { result: "success" },
  }),
  "diff-size",
);

const artifact = buildTelemetryArtifact({
  source: "harness-ci",
  TELEMETRY_SOURCE: "harness-ci",
  GITHUB_REPOSITORY: "org/repo",
  GITHUB_RUN_ID: "12345",
  pr_number: 10,
  pr_body: "closes #3",
});
assert.equal(artifact.schema_version, "1");
assert.equal(artifact.source, "harness-ci");
assert.equal(artifact.payload.pr_number, 10);
assert.match(artifactFilename({ source: "eval-ci", prNumber: 5, workflowRunId: 9 }), /^eval-ci-pr5-run9\.json$/);

const harnessCi = readFileSync(".github/workflows/harness-ci.yml", "utf8");
const trimmedTs = patchHarnessCi(harnessCi, stacksForHarness("ts"));
assert.ok(!trimmedTs.includes("product-python:"), "trimmed harness-ci should drop product-python job");
assert.ok(trimmedTs.includes("product-ts:"), "trimmed harness-ci should keep product-ts job");
assert.ok(
  !/telemetry:[\s\S]*- product-python/.test(trimmedTs),
  "telemetry needs should not reference trimmed product jobs",
);
assert.ok(/telemetry:[\s\S]*- product-ts/.test(trimmedTs), "telemetry needs should reference product-ts");

console.log("telemetry-artifact scenarios ok");
