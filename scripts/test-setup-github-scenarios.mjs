#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEvalRulesetPayload, buildRulesetPayload, parseLabels } from "./lib/github-config.mjs";

const labels = parseLabels(`
- name: task:docs
  color: "0E8A16"
  description: Documentation changes

- name: autonomy:L1
  color: "C2E0C6"
  description: Draft PR, human review required
`);

assert.deepEqual(labels, [
  {
    name: "task:docs",
    color: "0E8A16",
    description: "Documentation changes",
  },
  {
    name: "autonomy:L1",
    color: "C2E0C6",
    description: "Draft PR, human review required",
  },
]);

const tempDir = mkdtempSync(join(tmpdir(), "sdlc-gh-ruleset-"));
const template = join(tempDir, "ruleset.example.json");
writeFileSync(
  template,
  JSON.stringify({
    name: "main-protection",
    target: "branch",
    enforcement: "active",
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: "harness-static" }],
        },
      },
    ],
    _comment: "placeholder",
  }),
);

const payload = buildRulesetPayload(template, "python");
const contexts = payload.rules
  .find((rule) => rule.type === "required_status_checks")
  .parameters.required_status_checks.map((check) => check.context);

assert.equal(payload.name, "main-protection");
assert.equal(payload.enforcement, "active");
assert.deepEqual(contexts, ["diff-size", "harness-static", "issue-spec-check", "product-ci-python"]);
assert.equal("strict_required_status_checks_policy" in payload.rules[0].parameters, true);
assert.equal(readFileSync(template, "utf8").includes("_comment"), true);
assert.equal("_comment" in payload, false);

const evalTemplate = join(tempDir, "ruleset.harness-eval.example.json");
writeFileSync(
  evalTemplate,
  JSON.stringify({
    name: "harness-pr-eval-required",
    target: "branch",
    enforcement: "active",
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: "harness-static" }],
        },
      },
    ],
    _comment: "placeholder",
  }),
);

const evalPayload = buildEvalRulesetPayload(evalTemplate);
const evalContexts = evalPayload.rules
  .find((rule) => rule.type === "required_status_checks")
  .parameters.required_status_checks.map((check) => check.context);

assert.equal(evalPayload.name, "harness-pr-eval-required");
assert.deepEqual(evalContexts, ["harness-static", "select", "trajectory-conventions"]);
assert.equal("_comment" in evalPayload, false);

rmSync(tempDir, { recursive: true, force: true });
console.log("GitHub setup scenario tests passed");
