#!/usr/bin/env node
/**
 * Fetch inner-loop telemetry JSON artifacts from recent workflow runs.
 * Output directory: telemetry-collected/ (default)
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_COLLECT_DIR = "telemetry-collected";

export const TELEMETRY_WORKFLOWS = [
  { workflow: "harness-ci.yml", artifactPrefix: "harness-telemetry-" },
  { workflow: "eval-ci.yml", artifactPrefix: "eval-telemetry-" },
  { workflow: "agent-retry-orchestrator.yml", artifactPrefix: "retry-telemetry-" },
  { workflow: "pr-context-comment.yml", artifactPrefix: "pr-context-telemetry-" },
];

function ghJson(cmd) {
  const out = execSync(cmd, {
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function runQuiet(cmd) {
  try {
    execSync(cmd, { encoding: "utf8", env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string | Date} createdAt
 * @param {number} windowHours
 * @returns {boolean}
 */
export function isWithinWindow(createdAt, windowHours) {
  const created = new Date(createdAt).getTime();
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  return created >= cutoff;
}

/**
 * @param {string} dir
 * @returns {Record<string, unknown>[]}
 */
export function loadTelemetryJsonFiles(dir) {
  const records = [];
  let rootStat;
  try {
    rootStat = statSync(dir);
  } catch {
    return records;
  }
  if (!rootStat.isDirectory()) return records;

  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const info = statSync(path);
      if (info.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".json")) continue;
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        if (parsed?.payload) records.push(parsed);
      } catch {
        // skip invalid files
      }
    }
  };
  walk(dir);
  return records;
}

/**
 * @param {{ repo: string, outDir: string, windowHours: number }} options
 * @returns {{ downloadedRuns: number, records: Record<string, unknown>[], manifestPath: string }}
 */
export function fetchTelemetryArtifacts(options) {
  const repo = options.repo;
  const outDir = options.outDir ?? DEFAULT_COLLECT_DIR;
  const windowHours = Number(options.windowHours ?? 24);
  mkdirSync(outDir, { recursive: true });

  const manifest = {
    fetched_at: new Date().toISOString(),
    repo,
    window_hours: windowHours,
    runs: [],
    errors: [],
  };

  let downloadedRuns = 0;

  for (const { workflow, artifactPrefix } of TELEMETRY_WORKFLOWS) {
    let runs = [];
    try {
      runs = ghJson(
        `gh run list --repo ${repo} --workflow ${workflow} --limit 100 --json databaseId,createdAt,conclusion`,
      );
    } catch (error) {
      manifest.errors.push({ workflow, message: String(error.message || error) });
      continue;
    }

    for (const run of runs) {
      if (!isWithinWindow(run.createdAt, windowHours)) continue;
      const runId = run.databaseId;
      const artifactName = `${artifactPrefix}${runId}`;
      const targetDir = join(outDir, `${workflow.replace(/\.yml$/, "")}-${runId}`);
      mkdirSync(targetDir, { recursive: true });

      const ok = runQuiet(
        `gh run download ${runId} --repo ${repo} -n ${artifactName} -D "${targetDir}"`,
      );
      if (!ok) continue;

      downloadedRuns += 1;
      manifest.runs.push({
        workflow,
        run_id: runId,
        artifact: artifactName,
        conclusion: run.conclusion,
        path: targetDir,
      });
    }
  }

  const manifestPath = join(outDir, "fetch-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const records = loadTelemetryJsonFiles(outDir);
  return { downloadedRuns, records, manifestPath };
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error("::error::GITHUB_REPOSITORY is required");
    process.exit(1);
  }
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error("::error::GH_TOKEN or GITHUB_TOKEN is required");
    process.exit(1);
  }

  const outDir = process.env.TELEMETRY_COLLECT_DIR || DEFAULT_COLLECT_DIR;
  const windowHours = Number(process.env.WINDOW_HOURS || 24);
  const { downloadedRuns, records, manifestPath } = fetchTelemetryArtifacts({
    repo,
    outDir,
    windowHours,
  });

  console.log(`Downloaded telemetry from ${downloadedRuns} workflow run(s)`);
  console.log(`Loaded ${records.length} telemetry record(s) from ${outDir}`);
  console.log(`Manifest: ${manifestPath}`);
  if (records.length === 0) {
    console.warn(
      "::warning::No telemetry artifacts found in window — inner-loop emitters may not have run yet",
    );
  }
  console.log(`::notice::telemetry_records=${records.length}`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
