#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  NPM_PACKAGE_FILES,
  isPathCoveredByNpmFiles,
  postInstallHint,
  validateNpmSampleCoverage,
  validatePackageJsonFiles,
} from "./lib/npm-package.mjs";

const ROOT = resolve(process.cwd());

assert.equal(isPathCoveredByNpmFiles("sample/ts/src/index.ts"), true);
assert.equal(isPathCoveredByNpmFiles("sample/ts/node_modules/foo.js"), false);
assert.equal(isPathCoveredByNpmFiles("sample/php/vendor/autoload.php"), false);

const pkgCheck = validatePackageJsonFiles(ROOT);
assert.equal(pkgCheck.ok, true, pkgCheck.reason);

const coverage = validateNpmSampleCoverage(ROOT);
assert.deepEqual(coverage.missingOnDisk, []);
assert.deepEqual(coverage.notPacked, []);

assert.match(postInstallHint("ts"), /npm install/);
assert.match(postInstallHint("php"), /composer install/);

assert.ok(NPM_PACKAGE_FILES.includes("sample/go"));
assert.ok(NPM_PACKAGE_FILES.includes("scripts"));

console.log("npm package scenario tests passed");
