#!/usr/bin/env node
/**
 * Manifest of harness paths for sync; optional --against <repo-path> for drift diff.
 */
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const againstArg = process.argv.indexOf("--against");
const AGAINST = againstArg >= 0 ? resolve(process.argv[againstArg + 1] || "") : null;

const PATHS = [
  ".github/agents",
  ".github/hooks",
  ".github/instructions",
  ".github/skills",
  ".github/copilot-instructions.md",
  ".github/labels.yml",
  "scripts/validate-harness.mjs",
  "scripts/check-diff-size.mjs",
  "scripts/check-issue-spec.mjs",
  "scripts/lib/ccsd-contract.mjs",
  "docs/operations.md",
];

function hashFile(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  const st = statSync(dir);
  if (st.isFile()) {
    files.push(dir);
    return files;
  }
  for (const e of readdirSync(dir)) walk(join(dir, e), files);
  return files;
}

function buildReport(root) {
  const report = new Map();
  for (const p of PATHS) {
    const full = join(root, p);
    if (!existsSync(full)) {
      report.set(p, { status: "missing" });
      continue;
    }
    for (const f of walk(full)) {
      const rel = relative(root, f);
      report.set(rel, { sha256_12: hashFile(f) });
    }
  }
  return report;
}

const report = buildReport(ROOT);
const lines = ["## Harness drift manifest", "", "| Path | SHA (12) | Drift |", "|------|----------|-------|"];

let againstReport;
if (AGAINST) {
  if (!existsSync(AGAINST)) {
    console.error(`--against path not found: ${AGAINST}`);
    process.exit(1);
  }
  againstReport = buildReport(AGAINST);
  lines[0] = `## Harness drift vs \`${AGAINST}\``;
}

for (const [path, r] of [...report.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  let drift = "";
  if (againstReport) {
    const other = againstReport.get(path);
    if (!other || other.status === "missing") drift = "⚠️ missing downstream";
    else if (other.sha256_12 !== r.sha256_12) drift = "❌ differs";
    else drift = "✅";
  }
  if (r.status) lines.push(`| ${path} | _${r.status}_ | ${drift} |`);
  else lines.push(`| ${path} | \`${r.sha256_12}\` | ${drift} |`);
}

const text = lines.join("\n");
const out = process.env.GITHUB_STEP_SUMMARY;
if (out) {
  appendFileSync(out, text + "\n");
} else {
  console.log(text);
}

if (againstReport) {
  const drifts = [...report.entries()].filter(([path, r]) => {
    const other = againstReport.get(path);
    return r.sha256_12 && (!other || other.sha256_12 !== r.sha256_12);
  });
  if (drifts.length > 0) {
    console.warn(`::warning::${drifts.length} path(s) drift from --against repo`);
  }
}
