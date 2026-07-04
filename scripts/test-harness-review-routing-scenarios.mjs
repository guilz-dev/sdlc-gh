#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyRoutingPlanDryRun,
  bodyHasRoutingMarker,
  buildIssueAction,
  buildRoutingPlan,
  hasRepeatedFfFindings,
  hasRepeatedWallFindings,
  ISSUE_KIND,
  routingDedupeKey,
  routingMarker,
} from "./lib/harness-review-routing.mjs";

const sample = JSON.parse(
  readFileSync("infra/samples/harness-review-summary.json", "utf8"),
);

assert.equal(hasRepeatedFfFindings(sample), true);
assert.equal(hasRepeatedWallFindings(sample), false);

const plan = buildRoutingPlan(sample);
assert.equal(plan.actions.length, 1);
assert.equal(plan.actions[0].kind, ISSUE_KIND.HARNESS_REVISION);
assert.ok(plan.actions[0].body.includes(routingMarker(plan.actions[0].dedupe_key)));

const wallSummary = {
  ...sample,
  classifications: [
    ...sample.classifications,
    {
      repo: "org/product",
      task_id: "9",
      pr_number: 103,
      classification: "壁不足",
      rationale: "Harness CI passed while review_outcome is changes_requested",
      wall_failure_types: [],
      max_retry_count: 0,
    },
  ],
  rollup: {
    ...sample.rollup,
    by_classification: { ...sample.rollup.by_classification, 壁不足: 2 },
    review_rejection_proxy_count: 1,
  },
};
const wallPlan = buildRoutingPlan(wallSummary);
assert.equal(wallPlan.actions.length, 2);
assert.ok(wallPlan.actions.some((a) => a.kind === ISSUE_KIND.WALL_ADDITION));

const singleFf = {
  ...sample,
  classifications: [sample.classifications[1]],
  rollup: {
    ...sample.rollup,
    repeated_failure_signatures: [],
    by_classification: { FF不足: 1 },
  },
};
assert.equal(buildRoutingPlan(singleFf).actions.length, 0);
assert.ok(buildRoutingPlan(singleFf).skipped.length >= 1);

const dedupeKey = routingDedupeKey("org/product", ISSUE_KIND.HARNESS_REVISION, "lint");
const action = buildIssueAction(sample, ISSUE_KIND.HARNESS_REVISION, sample.classifications, "lint");
assert.equal(bodyHasRoutingMarker(action.body, dedupeKey), true);

const dry = applyRoutingPlanDryRun(plan, {
  existingIssues: [{ number: 99, body: action.body }],
});
assert.equal(dry.results[0].operation, "update_issue");
assert.equal(dry.results[0].issue_number, 99);

const lintOnlySignature = {
  ...sample,
  classifications: [sample.classifications[0]],
  rollup: {
    ...sample.rollup,
    by_classification: { モデル限界: 1 },
    repeated_failure_signatures: [
      { wall_failure_type: "lint", record_count: 2, task_count: 1, task_ids: ["42"] },
    ],
  },
};
assert.equal(hasRepeatedFfFindings(lintOnlySignature), true);
const lintOnlyPlan = buildRoutingPlan(lintOnlySignature);
assert.equal(lintOnlyPlan.actions.length, 0);
assert.ok(
  lintOnlyPlan.skipped.some((s) => s.reason.includes("without FF不足 classification")),
);

console.log("harness-review-routing scenarios ok");
