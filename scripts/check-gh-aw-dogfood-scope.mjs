#!/usr/bin/env node
/**
 * Enforce narrow file scope for task:gh-aw-dogfood PRs.
 */
import { execSync } from "node:child_process";
import {
  DOGFOOD_TASK_LABEL,
  evaluateDogfoodScope,
  isDogfoodAllowedPath,
  parseDogfoodLabels,
} from "./lib/gh-aw-dogfood.mjs";

function changedFiles() {
  const base = process.env.BASE_SHA || "origin/main";
  try {
    const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return execSync("git diff --name-only HEAD~1...HEAD", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  }
}

function main() {
  const labels = parseDogfoodLabels(process.env.PR_LABELS);
  const files = changedFiles();
  const touchesDogfood = files.some((file) => isDogfoodAllowedPath(file));
  const scope = evaluateDogfoodScope(files, labels);

  if (!scope.enforced) {
    if (touchesDogfood) {
      console.warn(
        `::warning::Dogfood paths changed without ${DOGFOOD_TASK_LABEL}; add label for scoped validation`,
      );
    }
    console.log("Not a gh-aw dogfood task; scope enforcement skipped");
    return;
  }

  if (!scope.ok) {
    console.error(`::error::Out-of-scope paths for ${DOGFOOD_TASK_LABEL}:`);
    for (const issue of scope.issues) console.error(`  - ${issue}`);
    console.error("Allowed paths: docs/gh-aw-dogfood.md#allowed-path-scope");
    process.exit(1);
  }

  console.log(`Dogfood scope check passed (${files.length} file(s))`);
}

main();
