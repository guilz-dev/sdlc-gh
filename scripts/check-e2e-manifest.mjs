#!/usr/bin/env node
/** Verify e2e-bench manifest freshness (Phase 4: 20% quarterly rotation) */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const manifestPath = join(process.cwd(), "evals/e2e-bench/manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Missing evals/e2e-bench/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tasks = manifest.tasks || [];
const minTasks = manifest.min_tasks || 5;
const lastRotated = new Date(manifest.last_rotated || 0);
const quarterMs = 90 * 24 * 60 * 60 * 1000;

console.log(`E2E tasks: ${tasks.length} (min ${minTasks})`);

if (tasks.length < minTasks) {
  console.error(`::error::Need at least ${minTasks} e2e tasks`);
  process.exit(1);
}

if (Date.now() - lastRotated.getTime() > quarterMs) {
  console.warn("::warning::E2E bench not rotated in 90 days — review manifest");
}
