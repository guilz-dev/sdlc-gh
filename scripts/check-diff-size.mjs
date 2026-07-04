#!/usr/bin/env node
/**
 * Diff size and autonomy gate for PRs.
 */
import { execSync } from "node:child_process";

const LIMITS = {
  L1: { loc: 300, files: 8 },
  L2: { loc: 120, files: 4 },
  L3: { loc: 60, files: 2 },
};

const labels = (process.env.PR_LABELS || process.argv[2] || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let level = "L1";
if (labels.some((l) => l.includes("autonomy:L3"))) level = "L3";
else if (labels.some((l) => l.includes("autonomy:L2"))) level = "L2";
else if (labels.some((l) => l.includes("autonomy:L0"))) level = "L1";

const hardFail = level === "L2" || level === "L3";
const { loc: maxLoc, files: maxFiles } = LIMITS[level];

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

let add = 0,
  del = 0,
  files = 0;
for (const line of numstat.split("\n").filter(Boolean)) {
  const [a, d] = line.split("\t");
  if (a === "-" && d === "-") continue;
  add += Number(a) || 0;
  del += Number(d) || 0;
  files++;
}

const loc = add + del;
console.log(`Autonomy: ${level} | LOC: ${loc}/${maxLoc} | Files: ${files}/${maxFiles}`);

if (loc > maxLoc || files > maxFiles) {
  const msg = `Change size exceeds ${level} limits`;
  if (hardFail) {
    console.error(`::error::${msg}`);
    process.exit(1);
  }
  console.warn(`::warning::${msg} — split recommended`);
}

let diffFiles;
try {
  diffFiles = git(`git diff --name-only ${diffRange}`).split("\n").filter(Boolean);
} catch {
  diffFiles = git("git diff --name-only HEAD~1...HEAD").split("\n").filter(Boolean);
}

const sensitive = [".github/workflows/", "infra/"];
const hasInfra = labels.some((l) => l.includes("task:infra"));
for (const f of diffFiles) {
  if (sensitive.some((p) => f.startsWith(p)) && !hasInfra) {
    console.warn(`::warning::${f} changed without task:infra label`);
  }
}
