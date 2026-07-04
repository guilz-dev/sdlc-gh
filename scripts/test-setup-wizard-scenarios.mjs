#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localChecks } from "./lib/doctor-local.mjs";
import {
  CODEOWNERS_PLACEHOLDER,
  applyCodeownersOwner,
  buildWizardPlan,
  codeownersHasPlaceholder,
  detectHarnessPresent,
  detectRepoProfile,
  isValidCodeownersOwner,
  suggestStack,
  writeHarnessStack,
} from "./lib/setup-wizard.mjs";

assert.equal(isValidCodeownersOwner("@acme/platform"), true);
assert.equal(isValidCodeownersOwner("@kaz-toc"), true);
assert.equal(isValidCodeownersOwner("acme/platform"), false);

const templateDir = mkdtempSync(join(tmpdir(), "sdlc-gh-wizard-template-"));
mkdirSync(join(templateDir, ".github/workflows"), { recursive: true });
mkdirSync(join(templateDir, "sample/ts"), { recursive: true });
mkdirSync(join(templateDir, "scripts"), { recursive: true });
writeFileSync(join(templateDir, ".github/workflows/harness-ci.yml"), "name: harness\n");
writeFileSync(join(templateDir, ".github/workflows/product-ci-ts.yml"), "name: product-ci-ts\n");
writeFileSync(join(templateDir, ".github/workflows/product-ci-python.yml"), "name: product-ci-python\n");
writeFileSync(join(templateDir, "scripts/doctor.mjs"), "// doctor\n");
writeFileSync(join(templateDir, "sample/ts/package.json"), "{}\n");
writeFileSync(join(templateDir, "package.json"), "{}\n");
writeFileSync(
  join(templateDir, ".github/CODEOWNERS"),
  `/.github/ ${CODEOWNERS_PLACEHOLDER}\n`,
);

const templateProfile = detectRepoProfile(templateDir);
assert.equal(templateProfile.kind, "template");
assert.equal(templateProfile.template, true);
assert.equal(detectHarnessPresent(templateDir), true);
assert.equal(suggestStack(templateDir), "ts");

writeHarnessStack(templateDir, "ts");
assert.equal(readFileSync(join(templateDir, ".harness-stack"), "utf8"), "ts\n");
assert.equal(codeownersHasPlaceholder(templateDir), true);
applyCodeownersOwner(templateDir, "@acme/platform");
assert.equal(codeownersHasPlaceholder(templateDir), false);

const templateDoctor = localChecks(templateDir, { nodeVersion: "22.0.0", templateMode: true });
assert.ok(templateDoctor.entries.every((entry) => entry.status === "PASS"));

const multiProduct = localChecks(templateDir, { nodeVersion: "22.0.0", templateMode: false });
assert.ok(multiProduct.entries.some((e) => e.label === "product-ci workflow" && e.status === "FAIL"));

const productDir = mkdtempSync(join(tmpdir(), "sdlc-gh-wizard-product-"));
mkdirSync(join(productDir, ".github/workflows"), { recursive: true });
writeFileSync(join(productDir, ".harness-stack"), "python\n");
writeFileSync(join(productDir, ".github/workflows/product-ci-python.yml"), "name: product-ci-python\n");
writeFileSync(join(productDir, ".github/CODEOWNERS"), "* @acme/platform\n");
const productDoctor = localChecks(productDir, { nodeVersion: "22.0.0", templateMode: false });
assert.ok(productDoctor.entries.every((entry) => entry.status === "PASS"));

const plan = buildWizardPlan({
  repoRoot: templateDir,
  stackId: "ts",
  owner: "@acme/platform",
  githubRepo: "acme/sdlc-gh",
  template: true,
  withEvalRuleset: false,
  yes: true,
  skipGithub: false,
  dryRun: false,
  writeHarnessStack: true,
  patchCodeowners: true,
});
assert.ok(plan.steps.some((step) => step.id === "setup-github"));
assert.ok(plan.steps.some((step) => step.id === "doctor" && step.detail.includes("--template")));

const unchangedPlan = buildWizardPlan({
  repoRoot: templateDir,
  stackId: "ts",
  owner: "@acme/other",
  githubRepo: "acme/sdlc-gh",
  template: false,
  withEvalRuleset: false,
  yes: true,
  skipGithub: true,
  dryRun: false,
  writeHarnessStack: true,
  patchCodeowners: false,
});
assert.ok(!unchangedPlan.steps.some((step) => step.id === "codeowners" && step.action === "patch"));
assert.ok(unchangedPlan.steps.some((step) => step.id === "codeowners" && step.action === "skip"));

console.log("Setup wizard scenario tests passed");
