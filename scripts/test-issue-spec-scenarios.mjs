#!/usr/bin/env node
/**
 * Scenario tests for CC-SD issue-spec-check validation.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CCSD_ENFORCED_TASK_CLASSES,
  isPlaceholderContent,
  pickLinkedIssue,
  resolveFetchFailureAction,
  shouldEnforceCcsd,
  validateCcsdFields,
  validateLabelShape,
} from "./lib/ccsd-contract.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = join(ROOT, "check-issue-spec.mjs");

function completeIssueBody({ omitField } = {}) {
  const fields = {
    Goal: "Update the README quick-start section with bootstrap instructions.",
    "Non-goals": "- Do not change CI workflows\n- Do not modify sample code",
    Constraints: "- Markdown only\n- Keep under 60 LOC",
    "Acceptance criteria":
      "- [ ] README lists all three bootstrap options\n- [ ] Links resolve correctly",
    "Rollback hints": "Revert the single README commit.",
  };
  if (omitField) delete fields[omitField];
  return Object.entries(fields)
    .map(([k, v]) => `### ${k}\n\n${v}`)
    .join("\n\n");
}

function runCheck(env) {
  return spawnSync("node", [CHECK_SCRIPT], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function assertExit(name, result, expectedCode) {
  if (result.status !== expectedCode) {
    console.error(`::error::${name}: expected exit ${expectedCode}, got ${result.status}`);
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(1);
  }
}

// Unit-level checks
const complete = validateCcsdFields(completeIssueBody());
if (!complete.ok) {
  console.error("::error::Complete issue body should pass validation");
  process.exit(1);
}

const missingNonGoals = validateCcsdFields(completeIssueBody({ omitField: "Non-goals" }));
if (missingNonGoals.ok || !missingNonGoals.missing.includes("Non-goals")) {
  console.error("::error::Missing Non-goals should fail validation");
  process.exit(1);
}

const placeholderRollback = validateCcsdFields(
  completeIssueBody().replace(
    "Revert the single README commit.",
    "How to revert this change immediately if needed.",
  ),
);
if (placeholderRollback.ok || !placeholderRollback.placeholder.includes("Rollback hints")) {
  console.error("::error::Placeholder Rollback hints should fail validation");
  process.exit(1);
}

const goalWithExtra = isPlaceholderContent(
  "One short paragraph describing what this task achieves. Update the README quick-start.",
);
if (goalWithExtra) {
  console.error("::error::Goal with placeholder prefix plus real content should pass");
  process.exit(1);
}

const nonGoalsWithReal = validateCcsdFields(
  completeIssueBody().replace(
    "- Do not change CI workflows\n- Do not modify sample code",
    "- Item the task must not do or change\n- Do not change CI workflows",
  ),
);
if (!nonGoalsWithReal.ok) {
  console.error("::error::Non-goals with placeholder line plus real bullets should pass");
  process.exit(1);
}

const acceptancePlaceholderOnly = validateCcsdFields(
  completeIssueBody().replace(
    "- [ ] README lists all three bootstrap options\n- [ ] Links resolve correctly",
    "- [ ] Criterion 1\n- [ ] Criterion 2",
  ),
);
if (acceptancePlaceholderOnly.ok || !acceptancePlaceholderOnly.placeholder.includes("Acceptance criteria")) {
  console.error("::error::Placeholder-only Acceptance criteria should fail validation");
  process.exit(1);
}

const acceptanceWithReal = validateCcsdFields(
  completeIssueBody().replace(
    "- [ ] README lists all three bootstrap options\n- [ ] Links resolve correctly",
    "- [ ] Criterion 1\n- [ ] README lists all three bootstrap options",
  ),
);
if (!acceptanceWithReal.ok) {
  console.error("::error::Acceptance criteria with placeholder line plus real item should pass");
  process.exit(1);
}

const ambiguous = pickLinkedIssue([
  { body: "a", labels: ["task:docs", "autonomy:L1"], issueNumber: 1 },
  { body: "b", labels: ["task:test-fix", "autonomy:L1"], issueNumber: 2 },
]);
if (ambiguous.kind !== "ambiguous") {
  console.error("::error::Multiple enforced issues should be flagged as ambiguous");
  process.exit(1);
}

const preferEnforced = pickLinkedIssue([
  { body: "skip", labels: ["task:feature-small", "autonomy:L1"], issueNumber: 10 },
  { body: "enforce", labels: ["task:docs", "autonomy:L1"], issueNumber: 11 },
]);
if (preferEnforced.kind !== "issue" || preferEnforced.issueNumber !== 11) {
  console.error("::error::pickLinkedIssue should prefer the enforced L1 docs/test-fix issue");
  process.exit(1);
}

if (!shouldEnforceCcsd(["task:docs", "autonomy:L1"])) {
  console.error("::error::task:docs + autonomy:L1 should trigger enforcement");
  process.exit(1);
}

if (shouldEnforceCcsd(["task:feature-small", "autonomy:L1"])) {
  console.error("::error::task:feature-small should not trigger enforcement in v1");
  process.exit(1);
}

for (const taskClass of ["infra", "security-sensitive"]) {
  if (shouldEnforceCcsd([`task:${taskClass}`, "autonomy:L1"])) {
    console.error(`::error::task:${taskClass} should not trigger enforcement`);
    process.exit(1);
  }
}

if (CCSD_ENFORCED_TASK_CLASSES.length !== 2) {
  console.error("::error::v1 should enforce exactly docs and test-fix");
  process.exit(1);
}

// Integration checks via check-issue-spec.mjs
const l1Labels = "task:docs,autonomy:L1";

assertExit(
  "docs+L1 complete passes",
  runCheck({ ISSUE_BODY: completeIssueBody(), ISSUE_LABELS: l1Labels }),
  0,
);

assertExit(
  "docs+L1 missing Non-goals fails",
  runCheck({
    ISSUE_BODY: completeIssueBody({ omitField: "Non-goals" }),
    ISSUE_LABELS: l1Labels,
  }),
  1,
);

assertExit(
  "docs+L1 placeholder Rollback hints fails",
  runCheck({
    ISSUE_BODY: completeIssueBody().replace(
      "Revert the single README commit.",
      "How to revert this change immediately if needed.",
    ),
    ISSUE_LABELS: l1Labels,
  }),
  1,
);

assertExit(
  "test-fix+L1 complete passes",
  runCheck({
    ISSUE_BODY: completeIssueBody().replace("README", "flaky unit test"),
    ISSUE_LABELS: "task:test-fix,autonomy:L1",
  }),
  0,
);

assertExit(
  "feature-small+L1 skips (passes)",
  runCheck({
    ISSUE_BODY: completeIssueBody({ omitField: "Non-goals" }),
    ISSUE_LABELS: "task:feature-small,autonomy:L1",
  }),
  0,
);

assertExit(
  "docs+L1 without linked issue fails when inferred from PR labels",
  runCheck({
    PR_LABELS: "task:docs,autonomy:L1",
  }),
  1,
);

for (const taskClass of ["infra", "security-sensitive"]) {
  assertExit(
    `${taskClass}+L1 skips (passes)`,
    runCheck({
      ISSUE_BODY: completeIssueBody({ omitField: "Non-goals" }),
      ISSUE_LABELS: `task:${taskClass},autonomy:L1`,
    }),
    0,
  );
}

const multipleTaskLabels = validateLabelShape([
  "task:docs",
  "task:test-fix",
  "autonomy:L1",
]);
if (multipleTaskLabels.ok) {
  console.error("::error::Multiple task:* labels should fail label shape validation");
  process.exit(1);
}

assertExit(
  "multiple task labels on L1 docs fails",
  runCheck({
    ISSUE_BODY: completeIssueBody(),
    ISSUE_LABELS: "task:docs,task:test-fix,autonomy:L1",
  }),
  1,
);

if (resolveFetchFailureAction(["task:docs", "autonomy:L1"]) !== "fail") {
  console.error("::error::Fetch failure with L1 docs proxy labels should fail");
  process.exit(1);
}

if (resolveFetchFailureAction(["task:infra", "autonomy:L1"]) !== "warn_skip") {
  console.error("::error::Fetch failure with infra proxy labels should warn/skip");
  process.exit(1);
}

if (resolveFetchFailureAction([]) !== "warn_skip") {
  console.error("::error::Fetch failure without proxy labels should warn/skip");
  process.exit(1);
}

console.log("Issue-spec scenario tests passed");
