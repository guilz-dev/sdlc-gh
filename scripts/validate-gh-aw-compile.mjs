#!/usr/bin/env node
/**
 * Validate gh-aw source .md workflows compile to committed .lock.yml without drift.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { GH_AW_SOURCE_WORKFLOWS } from "./lib/gh-aw-dogfood.mjs";

function hasGhAw() {
  try {
    execSync("gh aw version", { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const required = process.env.GH_AW_COMPILE_REQUIRED === "1";
  if (!hasGhAw()) {
    const msg = "gh aw CLI not available; compile validation skipped";
    if (required) {
      console.error(`::error::${msg}`);
      process.exit(1);
    }
    console.warn(`::warning::${msg}`);
    process.exit(0);
  }

  const issues = [];

  for (const wf of GH_AW_SOURCE_WORKFLOWS) {
    if (!existsSync(wf.md)) {
      issues.push(`${wf.md} missing`);
      continue;
    }
    if (!existsSync(wf.lock)) {
      issues.push(`${wf.lock} missing`);
      continue;
    }

    const before = readFileSync(wf.lock, "utf8");
    try {
      execSync(`gh aw compile ${wf.id}.md`, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      issues.push(`gh aw compile failed for ${wf.id}: ${error.stderr?.toString() || error.message}`);
      continue;
    }
    const after = readFileSync(wf.lock, "utf8");
    if (before !== after) {
      issues.push(`${wf.lock} drifted after gh aw compile — commit regenerated lock`);
    }
  }

  if (issues.length) {
    console.error("::error::gh-aw compile validation failed:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log(`gh-aw compile validation passed (${GH_AW_SOURCE_WORKFLOWS.length} workflow(s))`);
}

main();
