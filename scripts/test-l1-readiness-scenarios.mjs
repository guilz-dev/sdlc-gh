#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runReadinessCheck } from "./lib/l1-readiness.mjs";

const ROOT = resolve(process.cwd());
const checker = join(ROOT, "scripts/check-l1-readiness.mjs");

function writeMinimalHarness(repoDir, { stack = "ts", includeAgents = true, templateCodeowners = true } = {}) {
  mkdirSync(join(repoDir, ".github/workflows"), { recursive: true });
  mkdirSync(join(repoDir, ".github/ISSUE_TEMPLATE"), { recursive: true });
  if (includeAgents) {
    mkdirSync(join(repoDir, ".github/agents"), { recursive: true });
  }
  writeFileSync(
    join(repoDir, ".github/CODEOWNERS"),
    templateCodeowners
      ? "# template\n/.github/ @your-org/harness-engineers\n"
      : "* @acme/platform\n",
  );
  writeFileSync(join(repoDir, ".github/workflows/harness-ci.yml"), "name: harness-ci\n");
  writeFileSync(join(repoDir, `.github/workflows/product-ci-${stack}.yml`), `name: product-ci-${stack}\n`);
  writeFileSync(join(repoDir, ".github/workflows/copilot-setup-steps.yml"), "name: Copilot setup\n");
  writeFileSync(join(repoDir, ".github/ISSUE_TEMPLATE/task.yml"), "name: Task\n");
  if (includeAgents) {
    writeFileSync(join(repoDir, ".github/agents/triager.agent.md"), "---\nname: triager\n---\n");
    writeFileSync(join(repoDir, ".github/agents/implementer.agent.md"), "---\nname: implementer\n---\n");
  }
}

function makeFakeGh(binDir, handlers) {
  const fakeGh = join(binDir, "gh");
  const handlerSource = handlers
    .map(
      (handler, index) => `
function handler${index}(args) {
  ${handler.body}
}
`,
    )
    .join("\n");
  const dispatch = handlers
    .map((handler, index) => `if (${handler.match}) return handler${index}(args);`)
    .join("\n");

  writeFileSync(
    fakeGh,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
${handlerSource}
${dispatch}
process.stderr.write("unexpected gh invocation: " + JSON.stringify(args) + "\\n");
process.exit(1);
`,
    { mode: 0o755 },
  );
}

const repoDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-"));
writeMinimalHarness(repoDir);

const noGhBinDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-no-gh-bin-"));
makeFakeGh(noGhBinDir, [
  {
    match: 'args[0] === "--version"',
    body: 'process.stdout.write("gh version 2.0.0\\n"); process.exit(0);',
  },
  {
    match: 'args[0] === "auth" && args[1] === "status"',
    body: "process.exit(1);",
  },
]);
const isolatedEnv = {
  ...process.env,
  PATH: `${noGhBinDir}:${process.env.PATH}`,
};

const normal = spawnSync("node", [checker, "--template"], {
  cwd: repoDir,
  encoding: "utf8",
  env: isolatedEnv,
});
assert.equal(normal.status, 0, normal.stderr);
assert.match(normal.stdout, /PASS doctor:CODEOWNERS: template placeholder preserved/);
assert.match(normal.stdout, /MANUAL Copilot coding agent entitlement/);
assert.match(normal.stdout, /SKIP GitHub CLI\/Auth/);

const strict = spawnSync("node", [checker, "--template", "--strict"], {
  cwd: repoDir,
  encoding: "utf8",
  env: isolatedEnv,
});
assert.equal(strict.status, 1, `expected strict mode to fail on SKIP entries\n${strict.stdout}\n${strict.stderr}`);
assert.match(strict.stdout, /SKIP GitHub CLI\/Auth/);

const json = spawnSync("node", [checker, "--template", "--json"], {
  cwd: repoDir,
  encoding: "utf8",
  env: isolatedEnv,
});
assert.equal(json.status, 0, json.stderr);
const parsed = JSON.parse(json.stdout);
assert.equal(parsed.profile, "template");
assert.equal(parsed.stackId, "ts");
assert.equal(Array.isArray(parsed.entries), true);
assert.equal(parsed.exitCode, 0);

const missingAgentsDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-missing-"));
writeMinimalHarness(missingAgentsDir, { includeAgents: false });
const missing = runReadinessCheck({
  template: true,
  strict: false,
  repoRoot: missingAgentsDir,
});
assert.equal(missing.exitCode, 1, "missing L1 assets should fail");
assert.ok(
  missing.entries.some((entry) => entry.label.includes("implementer.agent.md") && entry.status === "FAIL"),
  "expected missing implementer agent to fail",
);

const inferredDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-inferred-"));
writeMinimalHarness(inferredDir, { stack: "python", templateCodeowners: false });
const inferredReport = runReadinessCheck({
  template: false,
  strict: false,
  repoRoot: inferredDir,
});
assert.equal(inferredReport.stackId, "python");
assert.ok(
  inferredReport.entries.some(
    (entry) => entry.label === "doctor:.harness-stack" && entry.status === "PASS" && entry.detail.includes("inferred python"),
  ),
);

const ghBinDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-gh-bin-"));
makeFakeGh(ghBinDir, [
  {
    match: 'args[0] === "--version"',
    body: 'process.stdout.write("gh version 2.0.0\\n"); process.exit(0);',
  },
  {
    match: 'args[0] === "auth" && args[1] === "status"',
    body: "process.exit(0);",
  },
  {
    match: 'args[0] === "repo" && args[1] === "view"',
    body: 'process.stdout.write(JSON.stringify({ nameWithOwner: "acme/product" }) + "\\n"); process.exit(0);',
  },
  {
    match: 'args[0] === "api" && args[1].includes("/labels")',
    body: 'process.stdout.write(JSON.stringify([{ name: "task:docs" }, { name: "task:test-fix" }, { name: "autonomy:L1" }]) + "\\n"); process.exit(0);',
  },
  {
    match: 'args[0] === "api" && args[1].endsWith("/rulesets")',
    body: 'process.stdout.write(JSON.stringify([{ id: 1, name: "main-protection" }]) + "\\n"); process.exit(0);',
  },
  {
    match: 'args[0] === "api" && args[1].includes("/rulesets/1")',
    body: `process.stdout.write(JSON.stringify({
      enforcement: "active",
      rules: [{
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: "harness-static" },
            { context: "diff-size" },
            { context: "issue-spec-check" },
            { context: "product-ci-python" },
          ],
        },
      }],
    }) + "\\n"); process.exit(0);`,
  },
  {
    match: 'args[0] === "api" && args[1].includes("copilot-setup-steps.yml/runs")',
    body: `process.stdout.write(JSON.stringify({
      workflow_runs: [{ id: 99, status: "in_progress", conclusion: null }],
    }) + "\\n"); process.exit(0);`,
  },
]);

const ghRepoDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-gh-"));
writeMinimalHarness(ghRepoDir, { stack: "python", templateCodeowners: false });
const ghReport = spawnSync("node", [checker, "--github-repo", "acme/product", "--json"], {
  cwd: ghRepoDir,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${ghBinDir}:${process.env.PATH}`,
  },
});
assert.equal(ghReport.status, 0, ghReport.stderr);
const ghParsed = JSON.parse(ghReport.stdout);
assert.ok(
  ghParsed.entries.some(
    (entry) => entry.label === "Copilot setup workflow" && entry.status === "WARN" && entry.detail.includes("in_progress"),
  ),
  "in-progress copilot setup should warn, not fail",
);

console.log("L1 readiness scenario tests passed");
