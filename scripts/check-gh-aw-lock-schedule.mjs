#!/usr/bin/env node
/**
 * Fail CI when gh-aw *.lock.yml workflows register on.schedule triggers.
 */
import { findLockScheduleViolations } from "./lib/gh-aw-lock-schedule.mjs";

const repoRoot = process.env.REPO_ROOT || process.cwd();
const result = findLockScheduleViolations(repoRoot);

if (!result.ok) {
  console.error("::error::gh-aw lock schedule check failed:");
  for (const v of result.violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("gh-aw lock schedule check passed");
