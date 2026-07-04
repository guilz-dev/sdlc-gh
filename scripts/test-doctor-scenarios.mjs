#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localChecks } from "./lib/doctor-local.mjs";

const tempDir = mkdtempSync(join(tmpdir(), "sdlc-gh-doctor-"));

mkdirSync(join(tempDir, ".github/workflows"), { recursive: true });
writeFileSync(join(tempDir, ".harness-stack"), "ts\n");
writeFileSync(join(tempDir, ".github/workflows/product-ci-ts.yml"), "name: product-ci-ts\n");
writeFileSync(
  join(tempDir, ".github/CODEOWNERS"),
  "* @my-org/harness-engineers\n",
);

const healthy = localChecks(tempDir, { nodeVersion: "22.0.0" });
assert.ok(healthy.entries.every((entry) => entry.status === "PASS"));
assert.equal(healthy.stackId, "ts");

const missingDir = mkdtempSync(join(tmpdir(), "sdlc-gh-doctor-missing-"));
mkdirSync(join(missingDir, ".github/workflows"), { recursive: true });
writeFileSync(join(missingDir, ".github/workflows/product-ci-ts.yml"), "name: product-ci-ts\n");
writeFileSync(join(missingDir, ".github/CODEOWNERS"), "* @my-org/harness-engineers\n");
const noStack = localChecks(missingDir, { nodeVersion: "22.0.0" });
assert.ok(noStack.entries.some((e) => e.label === ".harness-stack" && e.status === "FAIL"));

const placeholderDir = mkdtempSync(join(tmpdir(), "sdlc-gh-doctor-placeholder-"));
mkdirSync(join(placeholderDir, ".github/workflows"), { recursive: true });
writeFileSync(join(placeholderDir, ".harness-stack"), "python\n");
writeFileSync(join(placeholderDir, ".github/workflows/product-ci-python.yml"), "name: product-ci-python\n");
writeFileSync(
  join(placeholderDir, ".github/CODEOWNERS"),
  "* @your-org/harness-engineers\n",
);
const placeholder = localChecks(placeholderDir, { nodeVersion: "22.0.0" });
assert.ok(placeholder.entries.some((e) => e.label === "CODEOWNERS" && e.status === "FAIL"));

const oldNode = localChecks(tempDir, { nodeVersion: "20.0.0" });
assert.ok(oldNode.entries.some((e) => e.label === "Node.js" && e.status === "FAIL"));

console.log("Doctor scenario tests passed");
