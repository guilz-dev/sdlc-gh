#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const checker = join(ROOT, "scripts/check-l1-readiness.mjs");

const repoDir = mkdtempSync(join(tmpdir(), "sdlc-gh-l1-readiness-"));
mkdirSync(join(repoDir, ".github/workflows"), { recursive: true });
mkdirSync(join(repoDir, ".github/ISSUE_TEMPLATE"), { recursive: true });
mkdirSync(join(repoDir, ".github/agents"), { recursive: true });

writeFileSync(join(repoDir, ".harness-stack"), "ts\n");
writeFileSync(
  join(repoDir, ".github/CODEOWNERS"),
  "# template\n/.github/ @your-org/harness-engineers\n",
);
writeFileSync(join(repoDir, ".github/workflows/harness-ci.yml"), "name: harness-ci\n");
writeFileSync(join(repoDir, ".github/workflows/product-ci-ts.yml"), "name: product-ci-ts\n");
writeFileSync(join(repoDir, ".github/workflows/copilot-setup-steps.yml"), "name: Copilot setup\n");
writeFileSync(join(repoDir, ".github/ISSUE_TEMPLATE/task.yml"), "name: Task\n");
writeFileSync(join(repoDir, ".github/agents/triager.agent.md"), "---\nname: triager\n---\n");
writeFileSync(join(repoDir, ".github/agents/implementer.agent.md"), "---\nname: implementer\n---\n");

const normal = spawnSync("node", [checker, "--template"], {
  cwd: repoDir,
  encoding: "utf8",
});
assert.equal(normal.status, 0, normal.stderr);
assert.match(normal.stdout, /PASS doctor:CODEOWNERS: template placeholder preserved/);
assert.match(normal.stdout, /MANUAL Copilot coding agent entitlement/);

const strict = spawnSync("node", [checker, "--template", "--strict"], {
  cwd: repoDir,
  encoding: "utf8",
});
assert.equal(strict.status, 1, `expected strict mode to fail on WARN entries\n${strict.stdout}\n${strict.stderr}`);

const json = spawnSync("node", [checker, "--template", "--json"], {
  cwd: repoDir,
  encoding: "utf8",
});
assert.equal(json.status, 0, json.stderr);
const parsed = JSON.parse(json.stdout);
assert.equal(parsed.profile, "template");
assert.equal(parsed.stackId, "ts");
assert.equal(Array.isArray(parsed.entries), true);

console.log("L1 readiness scenario tests passed");
