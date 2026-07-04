#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { getStack } from "./stacks.mjs";

function mergeRequiredStatusChecks(existingChecks, requiredContexts) {
  const checks = Array.isArray(existingChecks) ? existingChecks : [];
  const deduped = new Map(checks.map((check) => [check.context, check]));
  for (const context of requiredContexts) {
    deduped.set(context, { context });
  }
  return [...deduped.values()].sort((a, b) => a.context.localeCompare(b.context));
}

function applyRequiredContexts(payload, requiredContexts) {
  const rules = Array.isArray(payload.rules) ? payload.rules : [];
  let statusRule = rules.find((rule) => rule.type === "required_status_checks");
  if (!statusRule) {
    statusRule = {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [],
      },
    };
    rules.push(statusRule);
    payload.rules = rules;
  }

  statusRule.parameters = {
    ...statusRule.parameters,
    strict_required_status_checks_policy: true,
    required_status_checks: mergeRequiredStatusChecks(
      statusRule.parameters?.required_status_checks,
      requiredContexts,
    ),
  };

  delete payload._comment;
  return payload;
}

export function buildMainRequiredContexts(stackId) {
  getStack(stackId);
  return ["harness-static", "diff-size", "issue-spec-check", `product-ci-${stackId}`];
}

export function buildEvalRequiredContexts() {
  return ["harness-static", "select", "trajectory-conventions"];
}

export function buildRulesetPayload(templatePath, stackId) {
  const payload = JSON.parse(readFileSync(templatePath, "utf8"));
  return applyRequiredContexts(payload, buildMainRequiredContexts(stackId));
}

export function buildEvalRulesetPayload(templatePath) {
  const payload = JSON.parse(readFileSync(templatePath, "utf8"));
  return applyRequiredContexts(payload, buildEvalRequiredContexts());
}

export function parseLabels(text) {
  const labels = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith("- name:")) {
      if (current) labels.push(current);
      current = {
        name: line.slice("- name:".length).trim(),
        color: "",
        description: "",
      };
      continue;
    }

    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("color:")) {
      current.color = trimmed.slice("color:".length).trim().replace(/^"|"$/g, "");
    } else if (trimmed.startsWith("description:")) {
      current.description = trimmed.slice("description:".length).trim().replace(/^"|"$/g, "");
    }
  }

  if (current) labels.push(current);
  return labels;
}

export function loadLabels(filePath) {
  return parseLabels(readFileSync(filePath, "utf8"));
}
