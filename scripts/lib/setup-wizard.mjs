#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { detectStackCandidates, getStack, stackIds } from "./stacks.mjs";

export const CODEOWNERS_PLACEHOLDER = "@your-org/harness-engineers";

/** @param {string} owner */
export function isValidCodeownersOwner(owner) {
  const trimmed = owner.trim();
  if (/^@[^/\s]+\/[^/\s]+$/.test(trimmed)) return true;
  if (/^@[\w.-]+$/.test(trimmed)) return true;
  return false;
}

/** @param {string} repoRoot */
export function detectHarnessPresent(repoRoot) {
  return (
    existsSync(join(repoRoot, ".github/workflows/harness-ci.yml")) &&
    existsSync(join(repoRoot, "scripts/doctor.mjs"))
  );
}

/** @param {string} repoRoot */
export function countProductCiWorkflows(repoRoot) {
  const workflowsDir = join(repoRoot, ".github/workflows");
  if (!existsSync(workflowsDir)) return 0;
  return readdirSync(workflowsDir).filter((name) => /^product-ci-.*\.yml$/.test(name)).length;
}

/**
 * @param {string} repoRoot
 * @param {{ template?: boolean }} [options]
 */
export function detectRepoProfile(repoRoot, options = {}) {
  const harnessPresent = detectHarnessPresent(repoRoot);
  const productCiCount = countProductCiWorkflows(repoRoot);
  const hasSampleStacks = existsSync(join(repoRoot, "sample/ts"));
  const template =
    options.template === true ||
    (harnessPresent && productCiCount > 1 && hasSampleStacks);

  let kind = "unknown";
  if (!harnessPresent) kind = "needs-bootstrap";
  else if (template) kind = "template";
  else kind = "product";

  return { kind, harnessPresent, productCiCount, hasSampleStacks, template };
}

/** @param {string} repoRoot */
export function readHarnessStack(repoRoot) {
  const stackFile = join(repoRoot, ".harness-stack");
  if (!existsSync(stackFile)) return "";
  return readFileSync(stackFile, "utf8").trim();
}

/** @param {string} repoRoot @param {string} stackId */
export function writeHarnessStack(repoRoot, stackId) {
  getStack(stackId);
  writeFileSync(join(repoRoot, ".harness-stack"), `${stackId}\n`, "utf8");
}

/** @param {string} repoRoot */
export function codeownersHasPlaceholder(repoRoot) {
  const codeownersFile = join(repoRoot, ".github/CODEOWNERS");
  if (!existsSync(codeownersFile)) return false;
  return readFileSync(codeownersFile, "utf8").includes(CODEOWNERS_PLACEHOLDER);
}

/** @param {string} repoRoot @param {string} owner */
export function applyCodeownersOwner(repoRoot, owner) {
  if (!isValidCodeownersOwner(owner)) {
    throw new Error(`Invalid CODEOWNERS owner: ${owner}`);
  }
  const codeownersFile = join(repoRoot, ".github/CODEOWNERS");
  if (!existsSync(codeownersFile)) {
    throw new Error(`Missing ${codeownersFile}`);
  }
  const current = readFileSync(codeownersFile, "utf8");
  writeFileSync(codeownersFile, current.replaceAll(CODEOWNERS_PLACEHOLDER, owner.trim()), "utf8");
}

/** @param {string} repoRoot */
export function suggestStack(repoRoot) {
  const detected = detectStackCandidates(repoRoot);
  if (detected.suggested) return detected.suggested;
  if (detectRepoProfile(repoRoot).template) return "ts";
  return "";
}

/** @param {string} repoRoot */
export function resolveGithubRepo(repoRoot) {
  const result = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return "";
  try {
    return JSON.parse(result.stdout).nameWithOwner ?? "";
  } catch {
    return "";
  }
}

/** @param {{ repoRoot: string, stackId: string, owner: string, githubRepo: string, template: boolean, withEvalRuleset: boolean, yes: boolean, skipGithub: boolean, dryRun: boolean, writeHarnessStack?: boolean, patchCodeowners?: boolean }} options */
export function buildWizardPlan(options) {
  const {
    repoRoot,
    stackId,
    owner,
    githubRepo,
    template,
    withEvalRuleset,
    skipGithub,
    dryRun,
    writeHarnessStack: shouldWriteStack = true,
    patchCodeowners = true,
  } = options;

  const steps = [];
  if (shouldWriteStack) {
    steps.push({ id: "harness-stack", action: "write", detail: `.harness-stack -> ${stackId}` });
  }
  if (patchCodeowners) {
    steps.push({
      id: "codeowners",
      action: "patch",
      detail: `replace ${CODEOWNERS_PLACEHOLDER} -> ${owner}`,
    });
  } else if (owner && owner !== "(unchanged)") {
    steps.push({
      id: "codeowners",
      action: "skip",
      detail: "CODEOWNERS placeholder already replaced; no change",
    });
  }
  if (!skipGithub) {
    steps.push({
      id: "setup-github",
      action: "run",
      detail: `sync labels + main-protection${withEvalRuleset ? " + eval ruleset" : ""} for ${githubRepo || "(auto)"}`,
    });
  }
  steps.push({
    id: "doctor",
    action: "run",
    detail: `doctor --strict${template ? " --template" : ""}${dryRun ? " (skipped in dry-run)" : ""}`,
  });
  return { repoRoot, stackId, owner, githubRepo, template, withEvalRuleset, skipGithub, dryRun, steps };
}

/** @param {string} repoRoot */
export function ghReady(repoRoot) {
  const version = spawnSync("gh", ["--version"], { stdio: "ignore" });
  if (version.status !== 0) return { ok: false, reason: "gh is not installed" };
  const auth = spawnSync("gh", ["auth", "status"], { stdio: "ignore" });
  if (auth.status !== 0) return { ok: false, reason: "gh is not authenticated" };
  return { ok: true, reason: "" };
}

/** @param {string} repoRoot @param {string[]} args */
function runScript(repoRoot, scriptName, args) {
  const scriptPath = join(repoRoot, "scripts", scriptName);
  return spawnSync(scriptPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

/** @param {{ repoRoot: string, stackId: string, mode: string, owner: string, yes: boolean }} options */
export function runBootstrap(options) {
  const { repoRoot, stackId, mode, owner, yes } = options;
  const scriptPath = join(repoRoot, "scripts/bootstrap-harness.sh");
  const args = [
    "--repo",
    repoRoot,
    "--stack",
    stackId,
    "--mode",
    mode,
    "--codeowners-team",
    owner,
  ];
  if (yes) args.push("--yes");
  return spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** @param {{ repoRoot: string, githubRepo: string, withEvalRuleset: boolean, yes: boolean, dryRun: boolean }} options */
export function runSetupGithub(options) {
  const { repoRoot, githubRepo, withEvalRuleset, yes, dryRun } = options;
  const args = [];
  if (githubRepo) args.push("--github-repo", githubRepo);
  if (withEvalRuleset) args.push("--with-eval-ruleset");
  if (yes) args.push("--yes");
  if (dryRun) args.push("--dry-run");
  return runScript(repoRoot, "setup-github.mjs", args);
}

/** @param {{ repoRoot: string, template: boolean, strict: boolean }} options */
export function runDoctor(options) {
  const { repoRoot, template, strict } = options;
  const args = [];
  if (strict) args.push("--strict");
  if (template) args.push("--template");
  return runScript(repoRoot, "doctor.mjs", args);
}

export { stackIds, detectStackCandidates, getStack };
