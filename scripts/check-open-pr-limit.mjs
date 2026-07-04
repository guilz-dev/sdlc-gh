#!/usr/bin/env node
/**
 * Safe-outputs substitute (Phase 0–2): warn when author has too many open PRs.
 * See docs/operations.md — gh-aw safe_outputs replaces this in Phase 3+.
 */
import { execSync } from "node:child_process";

const MAX_OPEN = Number(process.env.HARNESS_MAX_OPEN_PRS || 3);
const author = process.env.PR_AUTHOR || process.env.GITHUB_ACTOR;

if (!author) {
  console.log("No PR author context; skipping open PR limit check");
  process.exit(0);
}

let count = 0;
try {
  const out = execSync(
    `gh pr list --author "${author}" --state open --json number --jq 'length'`,
    { encoding: "utf8", env: process.env },
  );
  count = Number(out.trim()) || 0;
} catch {
  console.warn("::warning::Could not query open PRs (gh CLI unavailable); skipping");
  process.exit(0);
}

console.log(`Open PRs by ${author}: ${count} (warn above ${MAX_OPEN})`);

if (count > MAX_OPEN) {
  console.warn(
    `::warning::Author has ${count} open PRs (limit ${MAX_OPEN}). Close or merge before opening more.`,
  );
}
