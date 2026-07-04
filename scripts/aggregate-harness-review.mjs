#!/usr/bin/env node
/**
 * Aggregate telemetry artifacts and emit nightly harness review summary.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHarnessReviewSummary,
  formatHarnessReviewMarkdown,
} from "./lib/harness-review.mjs";
import { DEFAULT_COLLECT_DIR, loadTelemetryJsonFiles } from "./fetch-telemetry-artifacts.mjs";

export const REVIEW_OUT_DIR = "harness-review";

function main() {
  const inputDir = process.env.TELEMETRY_COLLECT_DIR || DEFAULT_COLLECT_DIR;
  const outDir = process.env.HARNESS_REVIEW_OUT_DIR || REVIEW_OUT_DIR;
  const windowHours = Number(process.env.WINDOW_HOURS || 24);
  const repo = process.env.GITHUB_REPOSITORY || "unknown/unknown";

  const records = loadTelemetryJsonFiles(inputDir);
  const summary = buildHarnessReviewSummary(records, {
    repo,
    windowHours,
  });
  const markdown = formatHarnessReviewMarkdown(summary);

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "harness-review-summary.json");
  const mdPath = join(outDir, "harness-review-summary.md");
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown, "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    `::notice::classified_failure_groups=${summary.rollup.failure_groups} telemetry_records=${summary.rollup.telemetry_records}`,
  );

  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    appendFileSync(stepSummaryPath, `${markdown}\n`, "utf8");
  }
}

main();
