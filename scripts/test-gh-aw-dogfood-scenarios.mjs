#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildDogfoodReport,
  DOGFOOD_TASK_LABEL,
  evaluateDogfoodScope,
  findOutOfScopePaths,
  isDogfoodAllowedPath,
  parseGhAwLockMetadata,
  parseGhAwWorkflowMarkdown,
  validateSafeOutputs,
} from "./lib/gh-aw-dogfood.mjs";
import { readFileSync } from "node:fs";

assert.equal(DOGFOOD_TASK_LABEL, "task:gh-aw-dogfood");
assert.equal(isDogfoodAllowedPath(".github/workflows/nightly-harness-review.md"), true);
assert.equal(isDogfoodAllowedPath(".github/labels.yml"), true);
assert.equal(isDogfoodAllowedPath("src/app.ts"), false);
assert.deepEqual(findOutOfScopePaths(["docs/gh-aw-dogfood.md", "src/x.ts"]), ["src/x.ts"]);

const scopeWithoutLabel = evaluateDogfoodScope(
  [".github/labels.yml", "src/x.ts"],
  [],
);
assert.equal(scopeWithoutLabel.ok, true);
assert.equal(scopeWithoutLabel.enforced, false);

const scopeWithLabel = evaluateDogfoodScope(["src/x.ts"], [DOGFOOD_TASK_LABEL]);
assert.equal(scopeWithLabel.ok, false);
assert.equal(scopeWithLabel.enforced, true);

const nightlyMd = readFileSync(".github/workflows/nightly-harness-review.md", "utf8");
const parsed = parseGhAwWorkflowMarkdown(nightlyMd);
assert.ok(parsed?.fields?.["safe-outputs"]);
assert.equal(validateSafeOutputs(parsed.fields).ok, true);

const redteamMd = readFileSync(".github/workflows/weekly-redteam.md", "utf8");
const redteam = parseGhAwWorkflowMarkdown(redteamMd);
assert.equal(validateSafeOutputs(redteam.fields).ok, true);

const lockMeta = parseGhAwLockMetadata(
  readFileSync(".github/workflows/nightly-harness-review.lock.yml", "utf8"),
);
assert.equal(lockMeta?.compiler_version, "v0.81.6");

const bad = validateSafeOutputs({
  "safe-outputs": { "create-pull-request": { max: 5 } },
});
assert.equal(bad.ok, false);

const report = buildDogfoodReport({
  scope: { ok: true, issues: [] },
  safeOutputs: { nightly: { ok: true, issues: [] } },
  compile: { ok: true, skipped: true, issues: [] },
  lockDrift: { ok: true, issues: [] },
});
assert.equal(report.pass, true);
assert.ok(report.criteria.reviewability.pass);

const reportCompileSkipped = buildDogfoodReport({
  scope: { ok: true, issues: [] },
  safeOutputs: { nightly: { ok: true, issues: [] } },
  compile: { ok: false, skipped: true, issues: ["gh aw CLI not available"] },
  lockDrift: { ok: true, issues: [] },
});
assert.equal(reportCompileSkipped.pass, true);

console.log("gh-aw-dogfood scenarios ok");
