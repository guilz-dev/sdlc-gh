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
writeFileSync(join(missingDir, ".github/CODEOWNERS"), "* @my-org/harness-engineers\n");
const noStack = localChecks(missingDir, { nodeVersion: "22.0.0" });
assert.ok(noStack.entries.some((e) => e.label === ".harness-stack" && e.status === "FAIL"));
assert.ok(noStack.entries.some((e) => e.label === "product-ci workflow" && e.status === "FAIL"));

const inferredDir = mkdtempSync(join(tmpdir(), "sdlc-gh-doctor-inferred-"));
mkdirSync(join(inferredDir, ".github/workflows"), { recursive: true });
writeFileSync(join(inferredDir, ".github/workflows/product-ci-python.yml"), "name: product-ci-python\n");
writeFileSync(join(inferredDir, ".github/CODEOWNERS"), "* @my-org/harness-engineers\n");
const inferred = localChecks(inferredDir, { nodeVersion: "22.0.0" });
assert.equal(inferred.stackId, "python");
assert.ok(inferred.entries.some((e) => e.label === ".harness-stack" && e.status === "PASS" && e.detail.includes("inferred python")));

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

const templateMulti = mkdtempSync(join(tmpdir(), "sdlc-gh-doctor-template-"));
mkdirSync(join(templateMulti, ".github/workflows"), { recursive: true });
writeFileSync(join(templateMulti, ".harness-stack"), "ts\n");
writeFileSync(join(templateMulti, ".github/workflows/product-ci-ts.yml"), "name: product-ci-ts\n");
writeFileSync(join(templateMulti, ".github/workflows/product-ci-go.yml"), "name: product-ci-go\n");
writeFileSync(join(templateMulti, ".github/CODEOWNERS"), "* @your-org/harness-engineers\n");
const templateMode = localChecks(templateMulti, { nodeVersion: "22.0.0", templateMode: true });
assert.ok(templateMode.entries.some((e) => e.label === "product-ci workflow" && e.status === "PASS"));
assert.ok(templateMode.entries.some((e) => e.label === "CODEOWNERS" && e.status === "PASS"));

const templatePersonalized = mkdtempSync(join(tmpdir(), "sdlc-gh-doctor-template-personal-"));
mkdirSync(join(templatePersonalized, ".github/workflows"), { recursive: true });
writeFileSync(join(templatePersonalized, ".harness-stack"), "ts\n");
writeFileSync(join(templatePersonalized, ".github/workflows/product-ci-ts.yml"), "name: product-ci-ts\n");
writeFileSync(join(templatePersonalized, ".github/workflows/product-ci-go.yml"), "name: product-ci-go\n");
writeFileSync(join(templatePersonalized, ".github/CODEOWNERS"), "* @acme/platform\n");
const templatePersonal = localChecks(templatePersonalized, { nodeVersion: "22.0.0", templateMode: true });
assert.ok(templatePersonal.entries.some((e) => e.label === "CODEOWNERS" && e.status === "FAIL"));

console.log("Doctor scenario tests passed");
