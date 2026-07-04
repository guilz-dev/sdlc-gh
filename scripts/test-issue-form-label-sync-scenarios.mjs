import assert from "node:assert/strict";
import { parseTaskIssueSelections, planIssueLabels } from "./lib/issue-form-label-sync.mjs";

const taskIssueBody = `### Goal

Tighten docs.

### Task class

docs

### Max autonomy level

L1
`;

const parsed = parseTaskIssueSelections(taskIssueBody);
assert.equal(parsed.isTaskIssue, true);
assert.equal(parsed.taskClass, "docs");
assert.equal(parsed.autonomy, "L1");
assert.equal(parsed.taskLabel, "task:docs");
assert.equal(parsed.autonomyLabel, "autonomy:L1");

const plan = planIssueLabels(["bug", "task:infra", "autonomy:L0"], parsed);
assert.deepEqual(plan.labels, ["bug", "task:docs", "autonomy:L1"]);
assert.equal(plan.changed, true);

const alreadySynced = planIssueLabels(["bug", "task:docs", "autonomy:L1"], parsed);
assert.equal(alreadySynced.changed, false);

const invalid = parseTaskIssueSelections(`### Goal

Test

### Task class

custom

### Max autonomy level

L9
`);
const invalidPlan = planIssueLabels(["bug"], invalid);
assert.equal(invalidPlan.changed, false);
assert.deepEqual(invalidPlan.labels, ["bug"]);

const nonTask = parseTaskIssueSelections("plain issue body");
assert.equal(nonTask.isTaskIssue, false);
