#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIZARD = join(PACKAGE_ROOT, "scripts/setup-wizard.mjs");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`sdlc-gh — GitHub Copilot agent harness installer

Usage:
  npx @guilz-dev/sdlc-gh [init] [wizard options]
  npx @guilz-dev/sdlc-gh --help

Runs the interactive setup wizard: bootstrap (if needed), GitHub labels/rulesets,
and doctor --strict.

Examples:
  cd /path/to/your-product && npx @guilz-dev/sdlc-gh
  npx @guilz-dev/sdlc-gh init --yes --stack ts --codeowners @acme/platform
  npx @guilz-dev/sdlc-gh init --repo /path/to/repo --mode existing --skip-github

Wizard options (forwarded):
  --repo <path>              Target repository (default: git root or cwd)
  --stack ts|python|go|...   Primary stack
  --codeowners @org/team     CODEOWNERS owner
  --github-repo owner/name   GitHub repository for setup-github
  --mode new|existing        Bootstrap mode when harness is missing
  --skip-github              Local files only
  --with-eval-ruleset        Also apply harness-pr-eval-required ruleset
  --yes                      Non-interactive
  --dry-run                  Print plan only

Requires Node.js 22+, bash, git, and \`gh\` (authenticated) for GitHub setup.
macOS / Linux / WSL recommended (bootstrap uses bash).
`);
}

function parseCliArgs(argv) {
  if (argv.length === 0) {
    return { command: "init", wizardArgs: [] };
  }

  const first = argv[0];
  if (first === "--help" || first === "-h") {
    return { command: "help", wizardArgs: [] };
  }
  if (first === "init") {
    return { command: "init", wizardArgs: argv.slice(1) };
  }
  if (first.startsWith("-")) {
    return { command: "init", wizardArgs: argv };
  }

  fail(`Unknown command: ${first}. Run \`npx @guilz-dev/sdlc-gh --help\`.`);
}

function main() {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 22) {
    fail(`Node.js 22+ required (current: ${process.versions.node}).`);
  }

  const { command, wizardArgs } = parseCliArgs(process.argv.slice(2));
  if (command === "help") {
    printHelp();
    process.exit(0);
  }

  const result = spawnSync(
    process.execPath,
    [WIZARD, "--template-root", PACKAGE_ROOT, ...wizardArgs],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SDLCGH_TEMPLATE_ROOT: PACKAGE_ROOT,
      },
    },
  );

  process.exit(result.status ?? 1);
}

main();
