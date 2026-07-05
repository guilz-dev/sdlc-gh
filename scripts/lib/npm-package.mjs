#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadStacks } from "./stacks.mjs";

/** Canonical npm `files` list — keep in sync with package.json */
export const NPM_PACKAGE_FILES = [
  "AGENTS.md",
  "config",
  "docs",
  "evals",
  "infra",
  "prompts",
  "scripts",
  ".github",
  "sample/go",
  "sample/python",
  "sample/ruby",
  "sample/php/composer.json",
  "sample/php/composer.lock",
  "sample/php/phpunit.xml",
  "sample/php/src",
  "sample/php/tests",
  "sample/ts/biome.json",
  "sample/ts/package.json",
  "sample/ts/package-lock.json",
  "sample/ts/tsconfig.json",
  "sample/ts/src",
  "sample/ts/tests",
];

const SAMPLE_SKIP_DIRS = new Set([
  "node_modules",
  "vendor",
  ".bundle",
  "__pycache__",
  ".pytest_cache",
  ".vite",
  ".phpunit.result.cache",
]);

/** @param {string} relPath repo-relative posix path */
export function isPathCoveredByNpmFiles(relPath, files = NPM_PACKAGE_FILES) {
  const normalized = relPath.replace(/\\/g, "/");
  for (const entry of files) {
    const pattern = entry.replace(/\\/g, "/");
    if (normalized === pattern) return true;
    if (normalized.startsWith(`${pattern}/`)) return true;
  }
  return false;
}

/** @param {string} root repository root */
function walkSampleFiles(root, sampleRelDir, out) {
  const abs = join(root, sampleRelDir);
  if (!existsSync(abs)) return;

  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SAMPLE_SKIP_DIRS.has(name)) continue;
      const absPath = join(dir, name);
      const relPath = relative(root, absPath).replace(/\\/g, "/");
      if (statSync(absPath).isDirectory()) {
        visit(absPath);
      } else {
        out.push(relPath);
      }
    }
  };
  visit(abs);
}

/**
 * @param {string} root repository root
 * @returns {{ missingOnDisk: string[], notPacked: string[] }}
 */
export function validateNpmSampleCoverage(root) {
  const missingOnDisk = [];
  for (const entry of NPM_PACKAGE_FILES) {
    if (!existsSync(join(root, entry))) {
      missingOnDisk.push(entry);
    }
  }

  const sampleFiles = [];
  for (const stack of loadStacks()) {
    walkSampleFiles(root, `sample/${stack.sampleDir}`, sampleFiles);
  }

  const notPacked = sampleFiles.filter((relPath) => !isPathCoveredByNpmFiles(relPath));
  return { missingOnDisk, notPacked };
}

/** @param {string} root repository root */
export function validatePackageJsonFiles(root) {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    return { ok: false, reason: "package.json not found" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const actual = [...(pkg.files ?? [])].sort();
  const expected = [...NPM_PACKAGE_FILES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return {
      ok: false,
      reason: "package.json files is out of sync with scripts/lib/npm-package.mjs (NPM_PACKAGE_FILES)",
    };
  }
  return { ok: true, reason: "" };
}

/** @param {string} stackId */
export function postInstallHint(stackId) {
  switch (stackId) {
    case "ts":
      return "Run `npm install` in the repository root before opening a PR.";
    case "python":
      return "Run `pip install -r requirements-dev.txt` (or your preferred venv workflow) before opening a PR.";
    case "go":
      return "Run `go test ./...` once to fetch modules before opening a PR.";
    case "ruby":
      return "Run `bundle install` before opening a PR.";
    case "php":
      return "Run `composer install` before opening a PR.";
    default:
      return "Install stack dependencies before opening a PR.";
  }
}
