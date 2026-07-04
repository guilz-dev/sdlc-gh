#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { formatReadinessSummary, runReadinessCheck } from "./lib/l1-readiness.mjs";

function parseArgs(argv) {
  const args = {
    githubRepo: "",
    template: false,
    strict: false,
    json: false,
    summary: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--github-repo") {
      args.githubRepo = argv[i + 1] ?? "";
      i += 1;
    } else if (value === "--template") {
      args.template = true;
    } else if (value === "--strict") {
      args.strict = true;
    } else if (value === "--json") {
      args.json = true;
    } else if (value === "--summary") {
      args.summary = true;
    } else if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${value}`);
      printHelp();
      process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: check-l1-readiness.mjs [options]

Checks whether spec-driven L1 delegation can run on this repository.

Options:
  --github-repo owner/name   Explicit GitHub repository name
  --template                 Template repository mode
  --strict                   Exit non-zero on SKIP as well as FAIL (same as doctor)
  --json                     Print machine-readable JSON summary
  --summary                  Append markdown summary to GITHUB_STEP_SUMMARY when set
`);
}

function printResult(entry) {
  console.log(`${entry.status} ${entry.label}: ${entry.detail}`);
  if (entry.fix) console.log(`  fix: ${entry.fix}`);
}

function printNextSteps(hasFail) {
  console.log("\nNext");
  if (hasFail) {
    console.log("- Fix FAIL items above, then re-run `node scripts/check-l1-readiness.mjs --strict`.");
  } else {
    console.log("- Create a Task issue from `.github/ISSUE_TEMPLATE/task.yml`.");
    console.log("- Fill CC-SD fields, then add labels: `task:docs` or `task:test-fix` + `autonomy:L1`.");
    console.log("- Assign `triager`, then `implementer` to start autonomous Draft PR flow.");
  }
}

const args = parseArgs(process.argv.slice(2));
const report = runReadinessCheck(args);

if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  for (const entry of report.entries) printResult(entry);
  printNextSteps(report.hasFail);
}

if (args.summary && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatReadinessSummary(report));
}

process.exit(report.exitCode);
