#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findLockScheduleViolations,
  lockContentHasScheduleTrigger,
} from "./lib/gh-aw-lock-schedule.mjs";

assert.equal(
  lockContentHasScheduleTrigger(`# gh-aw-metadata: v0.81.6\non:\n  schedule:\n  - cron: "0 2 * * *"\n`),
  true,
);

assert.equal(
  lockContentHasScheduleTrigger(`# gh-aw-metadata: v0.81.6\non:\n  workflow_dispatch:\n`),
  false,
);

assert.equal(lockContentHasScheduleTrigger(`on:\n  schedule:\n`), false);

const dir = mkdtempSync(join(tmpdir(), "gh-aw-lock-schedule-"));
const workflowsDir = join(dir, ".github/workflows");
mkdirSync(workflowsDir, { recursive: true });
writeFileSync(
  join(workflowsDir, "ok.lock.yml"),
  "# gh-aw-metadata: v0.81.6\non:\n  workflow_dispatch:\n",
);
writeFileSync(
  join(workflowsDir, "bad.lock.yml"),
  "# gh-aw-metadata: v0.81.6\non:\n  schedule:\n  - cron: \"0 2 * * *\"\n  workflow_dispatch:\n",
);

const bad = findLockScheduleViolations(dir);
assert.equal(bad.ok, false);
assert.equal(bad.violations.length, 1);
assert.match(bad.violations[0], /bad\.lock\.yml/);

writeFileSync(
  join(workflowsDir, "bad.lock.yml"),
  "# gh-aw-metadata: v0.81.6\non:\n  workflow_dispatch:\n",
);
assert.equal(findLockScheduleViolations(dir).ok, true);

console.log("gh-aw-lock-schedule scenarios ok");
