#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isTemplateRoot, resolveTemplateRoot } from "./lib/template-root.mjs";
import { runBootstrap } from "./lib/setup-wizard.mjs";

const ROOT = resolve(process.cwd());
assert.equal(isTemplateRoot(ROOT), true);

const resolved = resolveTemplateRoot({ fromModule: import.meta.url });
assert.equal(resolved, ROOT);

const emptyDir = mkdtempSync(join(tmpdir(), "sdlc-gh-cli-empty-"));
const prevCwd = process.cwd();
try {
  process.chdir(emptyDir);
  let threw = false;
  try {
    resolveTemplateRoot();
  } catch (error) {
    threw = true;
    assert.match(String(error.message), /Unable to locate harness template root/);
  }
  assert.equal(threw, true);
} finally {
  process.chdir(prevCwd);
}

const targetDir = mkdtempSync(join(tmpdir(), "sdlc-gh-cli-target-"));
mkdirSync(targetDir, { recursive: true });
const bootstrapResult = runBootstrap({
  repoRoot: targetDir,
  stackId: "ts",
  mode: "new",
  owner: "@acme/platform",
  yes: true,
  templateRoot: ROOT,
});
assert.equal(bootstrapResult.status, 0, bootstrapResult.stderr || bootstrapResult.stdout);
assert.equal(
  spawnSync("test", ["-f", join(targetDir, ".github/workflows/harness-ci.yml")]).status,
  0,
);

const helpResult = spawnSync(process.execPath, [join(ROOT, "scripts/sdlc-gh-cli.mjs"), "--help"], {
  encoding: "utf8",
});
assert.equal(helpResult.status, 0);
assert.match(helpResult.stdout, /@guilz-dev\/sdlc-gh/);

console.log("sdlc-gh CLI scenario tests passed");
