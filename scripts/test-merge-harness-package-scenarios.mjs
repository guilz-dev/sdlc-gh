#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mergeHarnessPackageJson } from "./lib/merge-harness-package.mjs";

const ROOT = resolve(process.cwd());
const templatePath = join(ROOT, "package.json");

const mergeDir = mkdtempSync(join(tmpdir(), "sdlc-gh-merge-pkg-"));
const targetPath = join(mergeDir, "package.json");
writeFileSync(
  targetPath,
  `${JSON.stringify(
    {
      name: "my-product",
      version: "1.0.0",
      private: true,
      scripts: {
        test: "vitest run",
        build: "tsc -p tsconfig.json",
      },
      dependencies: {
        react: "^19.0.0",
      },
    },
    null,
    2,
  )}\n`,
);

const merged = mergeHarnessPackageJson(templatePath, targetPath);
assert.equal(merged.action, "merged");
const parsed = JSON.parse(readFileSync(targetPath, "utf8"));
assert.equal(parsed.name, "my-product");
assert.equal(parsed.version, "1.0.0");
assert.deepEqual(parsed.dependencies, { react: "^19.0.0" });
assert.equal(parsed.scripts.test, "vitest run");
assert.equal(parsed.scripts.build, "tsc -p tsconfig.json");
assert.equal(typeof parsed.scripts["check-l1-readiness"], "string");
assert.equal(typeof parsed.scripts.validate, "string");

const createDir = mkdtempSync(join(tmpdir(), "sdlc-gh-merge-pkg-create-"));
const createdPath = join(createDir, "package.json");
const created = mergeHarnessPackageJson(templatePath, createdPath);
assert.equal(created.action, "created");
const createdParsed = JSON.parse(readFileSync(createdPath, "utf8"));
assert.equal(createdParsed.private, true);
assert.equal(typeof createdParsed.scripts["check-l1-readiness"], "string");
assert.equal(createdParsed.name, undefined);

console.log("Merge harness package scenario tests passed");
