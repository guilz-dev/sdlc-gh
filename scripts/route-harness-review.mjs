#!/usr/bin/env node
/**
 * Route nightly harness review summary into GitHub issues (#4).
 */
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyRoutingPlanDryRun,
  bodyHasRoutingMarker,
  buildRoutingPlan,
} from "./lib/harness-review-routing.mjs";
import { REVIEW_OUT_DIR } from "./lib/harness-review.mjs";

function ghJson(cmd) {
  const out = execSync(cmd, {
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function parseRepo(repo) {
  const [owner, name] = String(repo).split("/");
  if (!owner || !name) throw new Error(`Invalid GITHUB_REPOSITORY: ${repo}`);
  return { owner, name };
}

function ghApi(method, path, payload = null) {
  if (payload) {
    const file = join(tmpdir(), `gh-api-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(payload));
    try {
      const verb = method === "GET" ? "" : `-X ${method} `;
      return ghJson(`gh api ${verb}${path} --input ${file}`);
    } finally {
      unlinkSync(file);
    }
  }
  return ghJson(`gh api ${path}`);
}

function listOpenRoutedIssues(owner, name) {
  try {
    const issues = ghApi("GET", `repos/${owner}/${name}/issues?state=open&per_page=100`);
    return (Array.isArray(issues) ? issues : []).filter((issue) =>
      String(issue.body || "").includes("harness-routing-key:"),
    );
  } catch {
    return [];
  }
}

function createIssue(owner, name, action) {
  return ghApi("POST", `repos/${owner}/${name}/issues`, {
    title: action.title,
    body: action.body,
    labels: action.labels ?? [],
  });
}

function updateIssue(owner, name, issueNumber, action) {
  return ghApi("PATCH", `repos/${owner}/${name}/issues/${issueNumber}`, {
    title: action.title,
    body: action.body,
  });
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error("::error::GITHUB_REPOSITORY is required");
    process.exit(1);
  }

  const dryRun = process.env.HARNESS_ROUTING_DRY_RUN === "1";
  if (!dryRun && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error("::error::GH_TOKEN or GITHUB_TOKEN is required");
    process.exit(1);
  }

  const reviewDir = process.env.HARNESS_REVIEW_OUT_DIR || REVIEW_OUT_DIR;
  const summaryPath =
    process.env.HARNESS_REVIEW_SUMMARY_PATH || join(reviewDir, "harness-review-summary.json");
  if (!existsSync(summaryPath)) {
    console.error(`::error::Missing summary: ${summaryPath}`);
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const plan = buildRoutingPlan(summary);
  const { owner, name } = parseRepo(repo);

  mkdirSync(reviewDir, { recursive: true });
  const planPath = join(reviewDir, "harness-review-routing-plan.json");
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(`Wrote ${planPath}`);

  if (!(plan.actions ?? []).length) {
    console.log("No routing actions (thresholds not met)");
    console.log(`::notice::routing_actions=0`);
    return;
  }

  if (dryRun) {
    const preview = applyRoutingPlanDryRun(plan, { existingIssues: [] });
    const previewPath = join(reviewDir, "harness-review-routing-preview.json");
    writeFileSync(previewPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
    console.log(`Dry run: ${plan.actions.length} action(s) — see ${previewPath}`);
    console.log(`::notice::routing_actions=${plan.actions.length} dry_run=true`);
    return;
  }

  const existingIssues = listOpenRoutedIssues(owner, name);
  const results = [];

  for (const action of plan.actions) {
    const match = existingIssues.find((issue) =>
      bodyHasRoutingMarker(issue.body, action.dedupe_key),
    );
    if (match) {
      const updated = updateIssue(owner, name, match.number, action);
      results.push({
        dedupe_key: action.dedupe_key,
        operation: "update_issue",
        issue_number: updated.number,
        url: updated.html_url,
      });
      console.log(`Updated issue #${updated.number} (${action.kind})`);
    } else {
      const created = createIssue(owner, name, action);
      results.push({
        dedupe_key: action.dedupe_key,
        operation: "create_issue",
        issue_number: created.number,
        url: created.html_url,
      });
      console.log(`Created issue #${created.number} (${action.kind})`);
    }
  }

  const resultsPath = join(reviewDir, "harness-review-routing-results.json");
  writeFileSync(
    resultsPath,
    `${JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${resultsPath}`);
  console.log(`::notice::routing_actions=${results.length}`);

  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath && results.length) {
    const lines = ["", "## Issue routing", ""];
    for (const result of results) {
      lines.push(`- ${result.operation}: [#${result.issue_number}](${result.url})`);
    }
    appendFileSync(stepSummaryPath, `${lines.join("\n")}\n`, "utf8");
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
