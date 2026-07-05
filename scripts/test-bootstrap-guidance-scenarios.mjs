#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const scriptPath = join(ROOT, "scripts/bootstrap-harness.sh");

function runBootstrap({
  repoPath,
  extraEnv = {},
}) {
  return spawnSync(
    scriptPath,
    [
      "--repo",
      repoPath,
      "--stack",
      "ts",
      "--mode",
      "new",
      "--codeowners-team",
      "@acme/platform",
      "--yes",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ...extraEnv,
      },
    },
  );
}

const noGhRepoDir = mkdtempSync(join(tmpdir(), "sdlc-gh-guidance-no-gh-"));
const noGhRepo = join(noGhRepoDir, "repo");
mkdirSync(noGhRepo, { recursive: true });
const noGhResult = runBootstrap({ repoPath: noGhRepo });
assert.equal(noGhResult.status, 0, noGhResult.stderr);
assert.match(
  noGhResult.stdout,
  /Next: npx @guilz-dev\/sdlc-gh --yes --stack ts --codeowners @acme\/platform/,
);
assert.match(
  noGhResult.stdout,
  /setup-wizard\.mjs --yes --stack ts --codeowners @acme\/platform --github-repo OWNER\/REPO/,
);

const fakeBinDir = mkdtempSync(join(tmpdir(), "sdlc-gh-guidance-bin-"));
const fakeGh = join(fakeBinDir, "gh");
writeFileSync(
  fakeGh,
  `#!/bin/sh
if [ "$1" = "repo" ] && [ "$2" = "view" ] && [ "$3" = "--json" ] && [ "$4" = "nameWithOwner" ]; then
  printf '{"nameWithOwner":"acme/test-repo"}\\n'
  exit 0
fi
exit 1
`,
  { mode: 0o755 },
);

const ghRepoDir = mkdtempSync(join(tmpdir(), "sdlc-gh-guidance-gh-"));
const ghRepo = join(ghRepoDir, "repo");
mkdirSync(ghRepo, { recursive: true });
const gitInit = spawnSync("git", ["init"], {
  cwd: ghRepo,
  encoding: "utf8",
});
assert.equal(gitInit.status, 0, gitInit.stderr);
const ghResult = runBootstrap({
  repoPath: ghRepo,
  extraEnv: {
    PATH: `${fakeBinDir}:${process.env.PATH}`,
  },
});
assert.equal(ghResult.status, 0, ghResult.stderr);
assert.match(
  ghResult.stdout,
  /Next: npx @guilz-dev\/sdlc-gh --yes --stack ts --codeowners @acme\/platform/,
);
assert.doesNotMatch(
  ghResult.stdout,
  /npx @guilz-dev\/sdlc-gh --yes --stack ts --codeowners @acme\/platform --github-repo OWNER\/REPO/,
);

const copiedTest = readFileSync(join(ghRepo, "scripts/test-bootstrap-guidance-scenarios.mjs"), "utf8");
assert.ok(copiedTest.includes("setup-wizard.mjs"));

console.log("Bootstrap guidance scenario tests passed");
