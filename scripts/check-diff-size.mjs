#!/usr/bin/env node
/**
 * Diff size and autonomy gate for PRs.
 */
import { execSync } from "node:child_process";
import { evaluateDiffSize, parseLabelInput } from "./lib/diff-size.mjs";

const labels = parseLabelInput(process.env.PR_LABELS || process.argv[2] || "");
const l1HardFail = process.env.DIFF_SIZE_L1_HARD_FAIL === "1";

const base = process.env.BASE_SHA || "origin/main";
const diffRange = `${base}...HEAD`;

function git(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

let numstat;
try {
  numstat = git(`git diff --numstat ${diffRange}`);
} catch {
  numstat = git("git diff --numstat HEAD~1...HEAD");
}

let diffFiles;
try {
  diffFiles = git(`git diff --name-only ${diffRange}`).split("\n").filter(Boolean);
} catch {
  diffFiles = git("git diff --name-only HEAD~1...HEAD").split("\n").filter(Boolean);
}

const result = evaluateDiffSize({ labels, numstatText: numstat, diffFiles, l1HardFail });

console.log(result.summary);

if (result.overLimit && result.overLimitMessage) {
  if (result.mode === "hard-fail") {
    console.error(`::error::${result.overLimitMessage}`);
    process.exit(1);
  }
  console.warn(`::warning::${result.overLimitMessage} — split recommended`);
}

for (const warning of result.sensitiveWarnings) {
  console.warn(`::warning::${warning}`);
}
