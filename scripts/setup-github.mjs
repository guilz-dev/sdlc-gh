#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildEvalRulesetPayload, buildRulesetPayload, loadLabels } from "./lib/github-config.mjs";
import { getStack } from "./lib/stacks.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const stdin = Object.prototype.hasOwnProperty.call(options, "input") ? "pipe" : "inherit";
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: [stdin, "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    if (stderr) console.error(stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function hasGh() {
  return spawnSync("gh", ["--version"], { stdio: "ignore" }).status === 0;
}

function ensureGhAuth() {
  const auth = spawnSync("gh", ["auth", "status"], { stdio: "ignore" });
  if (auth.status !== 0) {
    fail("gh is not authenticated. Run `gh auth login`, then retry. Manual fallback: import .github/ruleset.example.json and apply labels from .github/labels.yml.");
  }
}

function parseArgs(argv) {
  const args = { githubRepo: "", yes: false, dryRun: false, withEvalRuleset: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--github-repo") {
      args.githubRepo = argv[i + 1] ?? "";
      i += 1;
    } else if (value === "--yes") {
      args.yes = true;
    } else if (value === "--dry-run") {
      args.dryRun = true;
    } else if (value === "--with-eval-ruleset") {
      args.withEvalRuleset = true;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return args;
}

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

function resolveGithubRepo(repoRoot, explicitRepo) {
  if (explicitRepo) return explicitRepo;
  const result = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail("Unable to determine GitHub repository. Re-run with `--github-repo owner/name`.");
  }
  const parsed = JSON.parse(result.stdout);
  return parsed.nameWithOwner;
}

async function confirm(summary, yes) {
  if (yes) return;
  console.log(summary);
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("Proceed? [y/N]: ");
  rl.close();
  if (!/^(y|yes)$/i.test(answer)) {
    console.log("Cancelled.");
    process.exit(1);
  }
}

function syncLabels(repoRoot, githubRepo, dryRun) {
  const labels = loadLabels(join(repoRoot, ".github/labels.yml"));
  for (const label of labels) {
    const encodedName = encodeURIComponent(label.name);
    const payload = JSON.stringify({
      new_name: label.name,
      color: label.color,
      description: label.description,
    });

    if (dryRun) {
      console.log(`[dry-run] label ${label.name}: PATCH/POST repos/${githubRepo}/labels`);
      continue;
    }

    const probe = spawnSync("gh", ["api", `repos/${githubRepo}/labels/${encodedName}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (probe.status === 0) {
      run("gh", [
        "api",
        "--method",
        "PATCH",
        `repos/${githubRepo}/labels/${encodedName}`,
        "--input",
        "-",
      ], { input: payload });
    } else {
      run("gh", [
        "api",
        "--method",
        "POST",
        `repos/${githubRepo}/labels`,
        "--input",
        "-",
      ], { input: JSON.stringify({ name: label.name, color: label.color, description: label.description }) });
    }
  }
}

function resolveExistingRulesetId(githubRepo, name) {
  const output = run("gh", ["api", `repos/${githubRepo}/rulesets`]);
  const rulesets = JSON.parse(output);
  const match = rulesets.find((ruleset) => ruleset.name === name);
  return match?.id ?? null;
}

function applyRuleset(repoRoot, githubRepo, dryRun, { templateName, buildPayload }) {
  const templatePath = join(repoRoot, `.github/${templateName}`);
  const payload = buildPayload(templatePath);
  const rulesetId = dryRun ? null : resolveExistingRulesetId(githubRepo, payload.name);
  const tempDir = mkdtempSync(join(tmpdir(), "sdlc-gh-ruleset-"));
  const tempFile = join(tempDir, "ruleset.json");
  writeFileSync(tempFile, JSON.stringify(payload, null, 2));

  try {
    if (dryRun) {
      console.log(`[dry-run] ruleset "${payload.name}" for ${githubRepo}`);
      console.log(readFileSync(tempFile, "utf8"));
      return;
    }

    if (rulesetId) {
      run("gh", [
        "api",
        "--method",
        "PUT",
        `repos/${githubRepo}/rulesets/${rulesetId}`,
        "--input",
        tempFile,
      ]);
    } else {
      run("gh", [
        "api",
        "--method",
        "POST",
        `repos/${githubRepo}/rulesets`,
        "--input",
        tempFile,
      ]);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function applyMainRuleset(repoRoot, githubRepo, stackId, dryRun) {
  applyRuleset(repoRoot, githubRepo, dryRun, {
    templateName: "ruleset.example.json",
    buildPayload: (templatePath) => buildRulesetPayload(templatePath, stackId),
  });
}

function applyEvalRuleset(repoRoot, githubRepo, dryRun) {
  applyRuleset(repoRoot, githubRepo, dryRun, {
    templateName: "ruleset.harness-eval.example.json",
    buildPayload: (templatePath) => buildEvalRulesetPayload(templatePath),
  });
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolveRepoRoot();
const stackFile = join(repoRoot, ".harness-stack");
if (!existsSync(stackFile)) {
  fail(`Missing ${stackFile}. Run bootstrap first.`);
}
const stackId = readFileSync(stackFile, "utf8").trim();
getStack(stackId);

if (!hasGh()) {
  fail("gh is required. Install it, run `gh auth login`, then retry. Manual fallback: import .github/ruleset.example.json and apply labels from .github/labels.yml.");
}
ensureGhAuth();

const githubRepo = resolveGithubRepo(repoRoot, args.githubRepo);
const actions = [
  "sync labels via API",
  "create/update main-protection ruleset",
];
if (args.withEvalRuleset) {
  actions.push("create/update harness-pr-eval-required ruleset (optional)");
}
await confirm(
  `GitHub setup summary\n  repo: ${repoRoot}\n  github repo: ${githubRepo}\n  stack: ${stackId}\n  actions: ${actions.join(", ")}`,
  args.yes,
);

syncLabels(repoRoot, githubRepo, args.dryRun);
applyMainRuleset(repoRoot, githubRepo, stackId, args.dryRun);
if (args.withEvalRuleset) {
  applyEvalRuleset(repoRoot, githubRepo, args.dryRun);
}

console.log(args.dryRun ? "Dry run complete." : "GitHub setup complete.");
