#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  aggregateDiffStats,
  evaluateDiffSize,
  resolveAutonomyLevel,
  resolveEnforcementMode,
  resolveLimits,
} from "./lib/diff-size.mjs";

// no label / L1 default warn
const l1Default = evaluateDiffSize({
  labels: [],
  numstatText: "400\t0\tbig.ts",
});
assert.equal(l1Default.level, "L1");
assert.equal(l1Default.mode, "warn");
assert.equal(l1Default.overLimit, true);

// L1 hard-fail opt-in
const l1Hard = evaluateDiffSize({
  labels: ["autonomy:L1"],
  numstatText: "400\t0\tbig.ts",
  l1HardFail: true,
});
assert.equal(l1Hard.mode, "hard-fail");
assert.equal(l1Hard.overLimit, true);

// L2 over-limit fail
const l2 = evaluateDiffSize({
  labels: ["autonomy:L2"],
  numstatText: "150\t0\ta.ts\n10\t0\tb.ts\n10\t0\tc.ts\n10\t0\td.ts\n10\t0\te.ts",
});
assert.equal(l2.level, "L2");
assert.equal(l2.mode, "hard-fail");
assert.equal(l2.overLimit, true);
assert.equal(resolveLimits("L2").loc, 120);

// L3 over-limit fail
const l3 = evaluateDiffSize({
  labels: ["autonomy:L3"],
  numstatText: "70\t0\ta.ts\n10\t0\tb.ts\n10\t0\tc.ts",
});
assert.equal(l3.level, "L3");
assert.equal(l3.mode, "hard-fail");
assert.equal(l3.overLimit, true);

// infra-sensitive path changed without task:infra warns
const infra = evaluateDiffSize({
  labels: ["task:docs", "autonomy:L1"],
  numstatText: "5\t0\tREADME.md",
  diffFiles: [".github/workflows/harness-ci.yml"],
});
assert.equal(infra.sensitiveWarnings.length, 1);
assert.match(infra.sensitiveWarnings[0], /task:infra/);

const infraOk = evaluateDiffSize({
  labels: ["task:infra", "autonomy:L0"],
  numstatText: "5\t0\t.github/workflows/harness-ci.yml",
  diffFiles: [".github/workflows/harness-ci.yml"],
});
assert.equal(infraOk.sensitiveWarnings.length, 0);

// L0 proposal-only: no size limits enforced (behavior/spec correction vs legacy L0→L1 fallback)
const l0Huge = evaluateDiffSize({
  labels: ["autonomy:L0"],
  numstatText: "5000\t0\ta.ts\n5000\t0\tb.ts",
});
assert.equal(l0Huge.level, "L0");
assert.equal(l0Huge.mode, "proposal-only");
assert.equal(l0Huge.limits, null);
assert.equal(l0Huge.overLimit, false);

// within limits passes
const ok = evaluateDiffSize({
  labels: ["autonomy:L2"],
  numstatText: "50\t0\ta.ts",
});
assert.equal(ok.overLimit, false);

assert.equal(resolveAutonomyLevel(["autonomy:L3"]), "L3");
assert.equal(resolveAutonomyLevel(["autonomy:L2"]), "L2");
assert.equal(resolveAutonomyLevel(["autonomy:L0"]), "L0");
assert.equal(resolveEnforcementMode("L1"), "warn");
assert.equal(resolveEnforcementMode("L1", { l1HardFail: true }), "hard-fail");
assert.equal(aggregateDiffStats("10\t5\tfile.ts").loc, 15);

console.log("Diff-size scenario tests passed");
