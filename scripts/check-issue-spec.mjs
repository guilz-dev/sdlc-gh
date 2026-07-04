#!/usr/bin/env node
/**
 * Validate linked Issue CC-SD contract for L1 task:docs / task:test-fix PRs.
 * Canonical field names live in scripts/lib/ccsd-contract.mjs.
 */
import { execSync } from "node:child_process";
import {
  CCSD_REQUIRED_FIELDS,
  extractClosingIssueNumbers,
  pickLinkedIssue,
  resolveFetchFailureAction,
  shouldEnforceCcsd,
  validateCcsdFields,
  validateLabelShape,
} from "./lib/ccsd-contract.mjs";

function ghJson(cmd) {
  const out = execSync(cmd, {
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function warn(msg) {
  console.warn(`::warning::${msg}`);
}

function error(msg) {
  console.error(`::error::${msg}`);
}

function parseLabelEnv(name) {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function proxyLabelsForFetchFailure(issueLabels = []) {
  const prLabels = parseLabelEnv("PR_LABELS");
  return [...new Set([...issueLabels, ...prLabels])];
}

function resolveIssueFromEnv() {
  const issueBody = process.env.ISSUE_BODY;
  const issueLabels = parseLabelEnv("ISSUE_LABELS");

  if (issueBody !== undefined) {
    return { body: issueBody, labels: issueLabels };
  }
  return null;
}

function fetchIssues(repo, issueNumbers) {
  const fetched = [];
  const failures = [];

  for (const issueNumber of issueNumbers) {
    try {
      const issue = ghJson(
        `gh issue view ${issueNumber} --repo ${repo} --json body,labels,number`,
      );
      fetched.push({
        body: issue.body,
        labels: (issue.labels || []).map((label) => label.name),
        issueNumber: issue.number,
      });
    } catch (e) {
      failures.push({ issueNumber, message: e.message });
    }
  }

  return { fetched, failures };
}

function resolveIssueFromGitHub() {
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.PR_NUMBER || process.env.GITHUB_EVENT_PR_NUMBER;
  const prBody = process.env.PR_BODY;

  if (!repo || !prNumber) return null;

  let body = prBody ?? "";
  let issueNumbers = [];

  try {
    const pr = ghJson(
      `gh pr view ${prNumber} --repo ${repo} --json body,closingIssuesReferences`,
    );
    body = prBody ?? pr.body ?? "";
    issueNumbers = (pr.closingIssuesReferences || []).map((issue) => issue.number);
  } catch {
    // Fall through to body keyword parsing.
  }

  if (issueNumbers.length === 0) {
    issueNumbers = extractClosingIssueNumbers(body);
  }

  issueNumbers = [...new Set(issueNumbers)];

  if (issueNumbers.length === 0) {
    return { noIssue: true };
  }

  const { fetched, failures } = fetchIssues(repo, issueNumbers);

  if (fetched.length === 0) {
    const nums = failures.map((f) => f.issueNumber).join(", ");
    return {
      fetchFailed: true,
      message: `Could not fetch linked issue(s) #${nums}`,
      proxyLabels: proxyLabelsForFetchFailure(),
    };
  }

  const picked = pickLinkedIssue(fetched);
  if (picked.kind === "ambiguous") {
    return {
      ambiguous: true,
      issueNumbers: picked.issueNumbers,
    };
  }

  if (picked.kind === "issue") {
    return {
      body: picked.body,
      labels: picked.labels,
      issueNumber: picked.issueNumber,
    };
  }

  return { noIssue: true };
}

function main() {
  const issue =
    resolveIssueFromEnv() ?? resolveIssueFromGitHub() ?? { noIssue: true };

  if (issue.fetchFailed) {
    const action = resolveFetchFailureAction(issue.proxyLabels);
    if (action === "fail") {
      error(
        `${issue.message} — cannot verify CC-SD for L1 docs/test-fix delegation`,
      );
      process.exit(1);
    }
    warn(`${issue.message}; skipping CC-SD enforcement`);
    process.exit(0);
  }

  if (issue.ambiguous) {
    error(
      `PR links multiple L1 docs/test-fix issues (#${issue.issueNumbers.join(", #")}); keep one enforced issue per PR`,
    );
    process.exit(1);
  }

  if (issue.noIssue) {
    warn(
      "PR is not tied to a resolvable Issue; skipping CC-SD enforcement (CI uses Issue labels, not the form dropdown)",
    );
    process.exit(0);
  }

  const { body, labels, issueNumber } = issue;

  const labelShape = validateLabelShape(labels);
  if (!labelShape.ok) {
    error(`Issue #${issueNumber}: ${labelShape.message}`);
    process.exit(1);
  }

  if (!shouldEnforceCcsd(labels)) {
    const taskLabels = labels.filter((l) => l.startsWith("task:")).join(", ") || "none";
    const autonomy = labels.find((l) => l.startsWith("autonomy:")) || "none";
    console.log(
      `CC-SD check skipped (task=${taskLabels}, autonomy=${autonomy}) — v1 enforces only autonomy:L1 on task:docs / task:test-fix`,
    );
    process.exit(0);
  }

  const result = validateCcsdFields(body);
  const prefix = issueNumber ? `Issue #${issueNumber}` : "Issue";

  if (result.missing.length > 0) {
    error(
      `${prefix} missing required CC-SD fields: ${result.missing.join(", ")}. Required: ${CCSD_REQUIRED_FIELDS.join(", ")}`,
    );
    process.exit(1);
  }

  if (result.placeholder.length > 0) {
    error(
      `${prefix} has placeholder-only CC-SD fields: ${result.placeholder.join(", ")}. Replace template placeholders with real content.`,
    );
    process.exit(1);
  }

  console.log(`${prefix} CC-SD contract complete for L1 docs/test-fix delegation`);
}

main();
