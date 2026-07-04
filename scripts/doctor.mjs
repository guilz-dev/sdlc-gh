#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { loadLabels } from "./lib/github-config.mjs";
import { localChecks, resolveStackId, result } from "./lib/doctor-local.mjs";

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage: doctor.mjs [--strict] [--template]

  --strict    Fail on SKIP checks (default: fail only on FAIL)
  --template  Allow multiple product-ci workflows (template repository mode)
`);
  process.exit(0);
}

const strict = argv.includes("--strict");
const templateMode = argv.includes("--template");

function resolveRepoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function printResult(entry) {
  console.log(`${entry.status} ${entry.label}: ${entry.detail}`);
  if (entry.fix) console.log(`  fix: ${entry.fix}`);
}

function ghAvailable() {
  return spawnSync("gh", ["--version"], { stdio: "ignore" }).status === 0;
}

function ghAuthed() {
  return spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status === 0;
}

function ghJson(args, cwd) {
  const result = spawnSync("gh", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "gh command failed");
  }
  return JSON.parse(result.stdout);
}

function ghJsonPages(args, cwd) {
  const result = spawnSync("gh", [...args, "--paginate", "--slurp"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "gh command failed");
  }
  return JSON.parse(result.stdout);
}

function githubChecks(repoRoot, stackId) {
  const entries = [];
  if (!ghAvailable()) {
    entries.push(result("SKIP", "GitHub CLI", "gh is not installed", "Install `gh` to verify labels and rulesets."));
    return entries;
  }
  if (!ghAuthed()) {
    entries.push(result("SKIP", "GitHub auth", "gh is not authenticated", "Run `gh auth login` to verify GitHub state."));
    return entries;
  }

  if (!stackId) {
    entries.push(
      result(
        "SKIP",
        "required status checks",
        "stack could not be resolved",
        "Ensure exactly one product-ci-*.yml workflow exists or run setup-wizard.",
      ),
    );
    return entries;
  }

  let repo;
  try {
    repo = ghJson(["repo", "view", "--json", "nameWithOwner"], repoRoot).nameWithOwner;
  } catch (error) {
    entries.push(result("SKIP", "GitHub repo", error.message, "Run doctor from a cloned GitHub repository."));
    return entries;
  }

  let remoteLabels = [];
  try {
    remoteLabels = ghJsonPages(["api", `repos/${repo}/labels`], repoRoot).flat();
  } catch (error) {
    entries.push(result("SKIP", "GitHub labels", error.message, "Run `./scripts/setup-github.sh` or apply `.github/labels.yml` manually."));
    return entries;
  }
  const expectedLabels = loadLabels(join(repoRoot, ".github/labels.yml")).map((label) => label.name);
  const remoteLabelNames = new Set(remoteLabels.map((label) => label.name));
  const missingLabels = expectedLabels.filter((name) => !remoteLabelNames.has(name));
  if (missingLabels.length === 0) {
    entries.push(result("PASS", "GitHub labels", "all required labels exist"));
  } else {
    entries.push(
      result(
        "FAIL",
        "GitHub labels",
        `missing labels: ${missingLabels.join(", ")}`,
        "Run `./scripts/setup-github.sh` to sync labels.",
      ),
    );
  }

  let rulesets = [];
  try {
    rulesets = ghJson(["api", `repos/${repo}/rulesets`], repoRoot);
  } catch (error) {
    entries.push(result("SKIP", "GitHub rulesets", error.message, "Grant repo admin permission or import `.github/ruleset.example.json` manually."));
    return entries;
  }

  const ruleset = rulesets.find((entry) => entry.name === "main-protection");
  if (!ruleset) {
    entries.push(result("FAIL", "main-protection ruleset", "missing", "Run `./scripts/setup-github.sh` to create it."));
    return entries;
  }
  entries.push(result("PASS", "main-protection ruleset", "exists"));

  try {
    const details = ghJson(["api", `repos/${repo}/rulesets/${ruleset.id}`], repoRoot);
    if (details.enforcement === "active") {
      entries.push(result("PASS", "ruleset enforcement", "active"));
    } else {
      entries.push(result("FAIL", "ruleset enforcement", `expected active, got ${details.enforcement}`, "Update the ruleset enforcement to active."));
    }

    const requiredRule = (details.rules ?? []).find((rule) => rule.type === "required_status_checks");
    const contexts = new Set((requiredRule?.parameters?.required_status_checks ?? []).map((check) => check.context));
    const expectedContexts = ["harness-static", "diff-size", "issue-spec-check", `product-ci-${stackId}`];
    const missingContexts = expectedContexts.filter((context) => !contexts.has(context));
    if (missingContexts.length === 0) {
      entries.push(result("PASS", "required status checks", `includes ${expectedContexts.join(", ")}`));
    } else {
      entries.push(
        result(
          "FAIL",
          "required status checks",
          `missing contexts: ${missingContexts.join(", ")}`,
          "Run `./scripts/setup-github.sh` to update the ruleset.",
        ),
      );
    }
  } catch (error) {
    entries.push(result("SKIP", "ruleset details", error.message, "Inspect the ruleset in GitHub Settings -> Rules."));
  }

  return entries;
}

const repoRoot = resolveRepoRoot();
const local = localChecks(repoRoot, { templateMode });
const stackId = local.stackId || resolveStackId(repoRoot);
const entries = [...local.entries, ...githubChecks(repoRoot, stackId)];
for (const entry of entries) printResult(entry);

const hasFail = entries.some((entry) => entry.status === "FAIL");
const hasSkip = entries.some((entry) => entry.status === "SKIP");
process.exit(hasFail || (strict && hasSkip) ? 1 : 0);
