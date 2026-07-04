#!/usr/bin/env node
/** Select eval jobs based on changed files (arch §5.2.1) */
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const base = process.env.BASE_SHA || "origin/main";
let files = [];
try {
  files = execSync(
    `git diff --name-only ${base}...HEAD 2>/dev/null || git diff --name-only HEAD~1`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {
  console.warn("::warning::Could not determine changed files; defaulting to trajectory-conventions");
}

const jobs = new Set();

if (files.some((f) => /^prompts\/.*\.prompt\.yml$/.test(f))) jobs.add("prompt-eval");
if (files.some((f) => f.startsWith(".github/agents/"))) {
  jobs.add("prompt-eval");
  jobs.add("agent-policy");
}
if (files.some((f) => f.startsWith(".github/instructions/") || f === "AGENTS.md")) {
  jobs.add("trajectory-conventions");
}
if (files.some((f) => f.startsWith(".github/skills/"))) jobs.add("trajectory-task");
if (files.some((f) => f.startsWith("evals/"))) jobs.add("meta-eval");

// Path-filtered workflow with no matching files (e.g. copilot-instructions only)
if (jobs.size === 0) jobs.add("trajectory-conventions");

const out = process.env.GITHUB_OUTPUT;
if (out) {
  appendFileSync(out, `jobs=${[...jobs].join(",")}\n`);
} else {
  console.log([...jobs].join(","));
}
