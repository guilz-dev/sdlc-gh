/**
 * Validate gh-aw compiled lock workflows do not register schedule triggers.
 * Prevents double execution alongside hand-written GHA scheduled workflows.
 * See docs/gh-aw-dogfood.md and gh-aw-improvements.md (P0).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LOCK_SCHEDULE_VIOLATION =
  "gh-aw lock workflow must not define on.schedule while GHA is the operational baseline";

/**
 * @param {string} content
 * @returns {boolean}
 */
export function lockContentHasScheduleTrigger(content) {
  const text = String(content);
  if (!text.includes("gh-aw-metadata")) return false;
  return /\bon:[\s\S]*?^\s+schedule:/m.test(text);
}

/**
 * @param {string} repoRoot
 * @param {string} [workflowsDir]
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function findLockScheduleViolations(repoRoot, workflowsDir = ".github/workflows") {
  const dir = join(repoRoot, workflowsDir);
  const violations = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".lock.yml")) continue;
    const path = join(dir, name);
    const content = readFileSync(path, "utf8");
    if (lockContentHasScheduleTrigger(content)) {
      violations.push(`${workflowsDir}/${name}: ${LOCK_SCHEDULE_VIOLATION}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * @param {string} repoRoot
 * @returns {boolean}
 */
export function assertNoLockScheduleTriggers(repoRoot) {
  const result = findLockScheduleViolations(repoRoot);
  if (!result.ok) {
    throw new Error(result.violations.join("\n"));
  }
  return true;
}
