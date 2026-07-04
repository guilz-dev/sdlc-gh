#!/usr/bin/env node
/**
 * Emit machine-readable gh-aw dogfood evaluation report.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDogfoodReport,
  evaluateDogfoodScope,
  evaluateSafeOutputsForWorkflows,
  GH_AW_SOURCE_WORKFLOWS,
  parseDogfoodLabels,
  parseGhAwLockMetadata,
} from "./lib/gh-aw-dogfood.mjs";

export const DOGFOOD_REPORT_DIR = "dogfood-report";

function hasGhAw() {
  try {
    execSync("gh aw version", { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

function changedFiles() {
  const base = process.env.BASE_SHA;
  if (!base) return [];
  try {
    return execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function evaluateScope() {
  const files = changedFiles();
  const labels = parseDogfoodLabels(process.env.PR_LABELS);
  const { ok, issues } = evaluateDogfoodScope(files, labels);
  return { ok, issues };
}

/** Lock metadata header presence (compile step catches byte-level drift). */
function evaluateLockMetadata() {
  const issues = [];
  for (const wf of GH_AW_SOURCE_WORKFLOWS) {
    if (!existsSync(wf.lock)) {
      issues.push(`${wf.lock} missing`);
      continue;
    }
    const metadata = parseGhAwLockMetadata(readFileSync(wf.lock, "utf8"));
    if (!metadata) issues.push(`${wf.lock} missing gh-aw-metadata header`);
    if (!existsSync(wf.md)) issues.push(`${wf.md} missing for ${wf.id}`);
  }
  return { ok: issues.length === 0, issues };
}

function evaluateCompile() {
  if (!hasGhAw()) {
    return {
      ok: true,
      skipped: true,
      issues: ["gh aw CLI not available"],
    };
  }

  const issues = [];
  for (const wf of GH_AW_SOURCE_WORKFLOWS) {
    if (!existsSync(wf.md) || !existsSync(wf.lock)) continue;
    const before = readFileSync(wf.lock, "utf8");
    try {
      execSync(`gh aw compile ${wf.id}.md`, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      issues.push(`${wf.id}: ${error.stderr?.toString().trim() || error.message}`);
      continue;
    }
    const after = readFileSync(wf.lock, "utf8");
    if (before !== after) issues.push(`${wf.lock} would change after compile`);
  }

  return { ok: issues.length === 0, skipped: false, issues };
}

function main() {
  const safeOutputs = evaluateSafeOutputsForWorkflows((path) => readFileSync(path, "utf8"));
  const report = buildDogfoodReport({
    repo: process.env.GITHUB_REPOSITORY || "unknown/unknown",
    scope: evaluateScope(),
    safeOutputs,
    compile: evaluateCompile(),
    lockDrift: evaluateLockMetadata(),
  });

  const outDir = process.env.DOGFOOD_REPORT_DIR || DOGFOOD_REPORT_DIR;
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "gh-aw-dogfood-report.json");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`::notice::gh_aw_dogfood_pass=${report.pass}`);

  if (!report.pass) {
    console.error("::error::gh-aw dogfood evaluation failed");
    process.exit(1);
  }
}

main();
