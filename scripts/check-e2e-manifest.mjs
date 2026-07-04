#!/usr/bin/env node
/** Verify e2e-bench manifest freshness and structural integrity */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateManifest } from "./lib/e2e-manifest.mjs";

const manifestPath = join(process.cwd(), "evals/e2e-bench/manifest.json");
const tasksDir = join(process.cwd(), "evals/e2e-bench/tasks");

if (!existsSync(manifestPath)) {
  console.error("Missing evals/e2e-bench/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const taskFileIds = existsSync(tasksDir)
  ? readdirSync(tasksDir)
      .filter((name) => name.endsWith(".yml"))
      .map((name) => name.replace(/\.yml$/, ""))
  : [];

const { errors, warnings, taskCount, minTasks } = validateManifest(manifest, taskFileIds);

console.log(`E2E tasks: ${taskCount} (min ${minTasks})`);

for (const warning of warnings) {
  console.warn(`::warning::${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`::error::${error}`);
  }
  process.exit(1);
}
