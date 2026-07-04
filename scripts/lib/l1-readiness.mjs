import { spawnSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { localChecks, result, resolveStackId } from "./doctor-local.mjs";
import { detectRepoProfile } from "./setup-wizard.mjs";

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

function ghJson(args, cwd) {
  const out = spawnSync("gh", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (out.status !== 0) {
    throw new Error(out.stderr.trim() || "gh command failed");
  }
  return JSON.parse(out.stdout);
}

function ghReady() {
  if (spawnSync("gh", ["--version"], { stdio: "ignore" }).status !== 0) {
    return { ok: false, reason: "gh is not installed" };
  }
  if (spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status !== 0) {
    return { ok: false, reason: "gh is not authenticated" };
  }
  return { ok: true, reason: "" };
}

function resolveGithubRepo(repoRoot, explicit) {
  if (explicit) return explicit;
  return ghJson(["repo", "view", "--json", "nameWithOwner"], repoRoot).nameWithOwner;
}

function checkLocalL1Assets(repoRoot) {
  const entries = [];
  const requiredFiles = [
    ".github/ISSUE_TEMPLATE/task.yml",
    ".github/agents/triager.agent.md",
    ".github/agents/implementer.agent.md",
    ".github/workflows/copilot-setup-steps.yml",
    ".github/workflows/harness-ci.yml",
  ];
  for (const file of requiredFiles) {
    if (existsSync(join(repoRoot, file))) {
      entries.push(result("PASS", file, "exists"));
    } else {
      entries.push(result("FAIL", file, "missing", "Run bootstrap/setup wizard and commit harness assets."));
    }
  }
  return entries;
}

function checkGithubState(repoRoot, githubRepo, stackId) {
  const entries = [];

  if (!stackId) {
    entries.push(
      result(
        "SKIP",
        "L1 required checks",
        "stack could not be resolved",
        "Ensure exactly one product-ci-*.yml workflow exists or run setup-wizard.",
      ),
    );
    return entries;
  }

  let labels = [];
  try {
    labels = ghJson(["api", `repos/${githubRepo}/labels?per_page=100`], repoRoot);
  } catch (error) {
    entries.push(result("SKIP", "GitHub labels", error.message, "Run `./scripts/setup-github.sh` to sync labels."));
  }
  if (labels.length > 0) {
    const requiredLabels = ["task:docs", "task:test-fix", "autonomy:L1"];
    const remote = new Set(labels.map((l) => l.name));
    const missing = requiredLabels.filter((name) => !remote.has(name));
    if (missing.length === 0) {
      entries.push(result("PASS", "L1 labels", requiredLabels.join(", ")));
    } else {
      entries.push(result("FAIL", "L1 labels", `missing: ${missing.join(", ")}`, "Run `./scripts/setup-github.sh`."));
    }
  }

  try {
    const rulesets = ghJson(["api", `repos/${githubRepo}/rulesets`], repoRoot);
    const main = rulesets.find((r) => r.name === "main-protection");
    if (!main) {
      entries.push(result("FAIL", "main-protection ruleset", "missing", "Run `./scripts/setup-github.sh`."));
    } else {
      entries.push(result("PASS", "main-protection ruleset", "exists"));
      const details = ghJson(["api", `repos/${githubRepo}/rulesets/${main.id}`], repoRoot);
      const statusRule = (details.rules ?? []).find((rule) => rule.type === "required_status_checks");
      const contexts = new Set((statusRule?.parameters?.required_status_checks ?? []).map((c) => c.context));
      const expected = ["harness-static", "diff-size", "issue-spec-check", `product-ci-${stackId}`];
      const missing = expected.filter((name) => !contexts.has(name));
      if (missing.length === 0) {
        entries.push(result("PASS", "L1 required checks", expected.join(", ")));
      } else {
        entries.push(
          result(
            "FAIL",
            "L1 required checks",
            `missing: ${missing.join(", ")}`,
            "Update rulesets via `./scripts/setup-github.sh`.",
          ),
        );
      }
    }
  } catch (error) {
    entries.push(result("SKIP", "GitHub rulesets", error.message, "Check repository Rulesets in GitHub settings."));
  }

  try {
    const runs = ghJson(
      ["api", `repos/${githubRepo}/actions/workflows/copilot-setup-steps.yml/runs?per_page=5`],
      repoRoot,
    );
    const latest = runs.workflow_runs?.[0];
    if (!latest) {
      entries.push(
        result(
          "WARN",
          "Copilot setup workflow",
          "no runs found",
          "Run Actions > Copilot setup > workflow_dispatch once.",
        ),
      );
    } else if (latest.status === "in_progress" || latest.status === "queued" || latest.conclusion == null) {
      entries.push(
        result(
          "WARN",
          "Copilot setup workflow",
          `latest run ${latest.id} is ${latest.status ?? "in progress"}`,
          "Wait for the Copilot setup workflow to finish, then re-run this check.",
        ),
      );
    } else if (latest.conclusion === "success") {
      entries.push(result("PASS", "Copilot setup workflow", `latest run ${latest.id} is success`));
    } else {
      entries.push(
        result(
          "FAIL",
          "Copilot setup workflow",
          `latest run ${latest.id} conclusion=${latest.conclusion}`,
          "Re-run the Copilot setup workflow and fix failures.",
        ),
      );
    }
  } catch (error) {
    entries.push(
      result(
        "SKIP",
        "Copilot setup workflow",
        error.message,
        "Verify workflow file exists and you have Actions read permission.",
      ),
    );
  }

  return entries;
}

export function formatReadinessSummary(report) {
  const lines = [
    "## L1 readiness",
    "",
    `- Profile: **${report.profile}**`,
    `- Stack: **${report.stackId || "(unresolved)"}**`,
    `- Result: **${report.hasFail ? "FAIL" : report.hasSkip && report.strict ? "SKIP (strict)" : "PASS"}**`,
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
  ];
  for (const entry of report.entries) {
    lines.push(`| ${entry.status} | ${entry.label} | ${entry.detail.replace(/\|/g, "\\|")} |`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * @param {{ githubRepo?: string, template?: boolean, strict?: boolean, json?: boolean, summary?: boolean, repoRoot?: string }} args
 */
export function runReadinessCheck(args) {
  const repoRoot = args.repoRoot || resolveRepoRoot();
  const profile = detectRepoProfile(repoRoot, { template: args.template });
  const template = profile.template || args.template;
  const local = localChecks(repoRoot, { templateMode: template });
  const stackId = local.stackId || resolveStackId(repoRoot);

  const entries = [];
  entries.push(result("PASS", "Repository", repoRoot));
  entries.push(result("PASS", "Profile", template ? "template" : "product"));
  entries.push(
    stackId
      ? result("PASS", "Stack", stackId)
      : result("FAIL", "Stack", "could not resolve stack id", "Run setup-wizard or ensure one product-ci-*.yml exists."),
  );

  entries.push(
    ...local.entries.map((entry) => ({
      ...entry,
      label: `doctor:${entry.label}`,
    })),
  );
  entries.push(...checkLocalL1Assets(repoRoot));

  const gh = ghReady();
  if (!gh.ok) {
    entries.push(result("SKIP", "GitHub CLI/Auth", gh.reason, "Install/authenticate `gh` to verify remote readiness."));
  } else {
    try {
      const githubRepo = resolveGithubRepo(repoRoot, args.githubRepo ?? "");
      entries.push(result("PASS", "GitHub repository", githubRepo));
      entries.push(...checkGithubState(repoRoot, githubRepo, stackId));
    } catch (error) {
      entries.push(
        result("SKIP", "GitHub repository", error.message, "Run from a cloned GitHub repo or pass --github-repo."),
      );
    }
  }

  entries.push(
    result(
      "MANUAL",
      "Copilot coding agent entitlement",
      "cannot be verified from repository configuration alone",
      "Ensure your org/repo has GitHub Copilot coding agent enabled.",
    ),
  );

  const hasFail = entries.some((entry) => entry.status === "FAIL");
  const hasSkip = entries.some((entry) => entry.status === "SKIP");
  const hasWarn = entries.some((entry) => entry.status === "WARN");

  return {
    repoRoot,
    profile: template ? "template" : "product",
    stackId,
    strict: Boolean(args.strict),
    hasFail,
    hasSkip,
    hasWarn,
    entries,
    exitCode: hasFail || (args.strict && hasSkip) ? 1 : 0,
  };
}
