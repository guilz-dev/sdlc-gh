#!/usr/bin/env node
/**
 * Run executable acceptance checks for E2E bench tasks.
 *
 * This is not yet a full agentic break/fix runner. It validates that each task
 * has machine-checkable acceptance criteria and that the current fixture/sample
 * state satisfies them, so the outer loop measures more than file existence.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const manifestPath = join(ROOT, "evals/e2e-bench/manifest.json");
const tasksDir = join(ROOT, "evals/e2e-bench/tasks");
const nodeMajor = Number(process.versions.node.split(".")[0]);

if (!existsSync(manifestPath)) {
  console.error("Missing evals/e2e-bench/manifest.json");
  process.exit(1);
}

function parseSimpleYaml(path) {
  const out = {};
  let currentListKey = null;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "    ");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const scalar = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (scalar) {
      out[scalar[1]] = scalar[2].trim();
      currentListKey = null;
      continue;
    }

    const listStart = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (listStart) {
      currentListKey = listStart[1];
      out[currentListKey] = [];
      continue;
    }

    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      out[currentListKey].push(listItem[1].trim());
      continue;
    }

    throw new Error(`Unsupported task syntax in ${path}: ${rawLine}`);
  }
  return out;
}

function supportsRequirement(requirement) {
  if (!requirement) return true;
  const nodeReq = requirement.match(/^node>=(\d+)$/);
  if (nodeReq) return nodeMajor >= Number(nodeReq[1]);
  const cmdReq = requirement.match(/^cmd:(.+)$/);
  if (cmdReq) {
    try {
      execSync(`command -v ${cmdReq[1]}`, {
        stdio: "pipe",
        encoding: "utf8",
      });
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function parseScopedSpec(spec) {
  const parts = spec.split("::");
  if (parts.length < 2) {
    throw new Error(`Invalid verification spec: ${spec}`);
  }
  const scope = parts.shift();
  const payload = parts.join("::");
  let requirement = null;
  let cwd = ".";
  if (scope.includes("@")) {
    [requirement, cwd] = scope.split("@", 2);
  } else {
    cwd = scope;
  }
  return {
    requirement,
    cwd: cwd === "." ? ROOT : resolve(ROOT, cwd),
    payload,
  };
}

function runCommandSpec(spec, taskId, counters) {
  const { requirement, cwd, payload } = parseScopedSpec(spec);
  if (!supportsRequirement(requirement)) {
    counters.skipped++;
    console.warn(`::warning::${taskId}: skipped "${payload}" (${requirement} not available)`);
    return;
  }
  execSync(payload, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  });
  counters.executed++;
}

function runContainsSpec(spec, taskId, counters, negate = false) {
  const [file, ...needleParts] = spec.split("::");
  if (!file || needleParts.length === 0) {
    throw new Error(`Invalid file assertion spec: ${spec}`);
  }
  const needle = needleParts.join("::");
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    throw new Error(`${taskId}: missing file for assertion: ${file}`);
  }
  const text = readFileSync(path, "utf8");
  const matched = text.includes(needle);
  if (negate ? matched : !matched) {
    throw new Error(
      `${taskId}: ${negate ? "unexpected" : "missing"} content in ${file}: ${needle}`,
    );
  }
  counters.executed++;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tasks = manifest.tasks || [];
let failed = 0;
let executedChecks = 0;
let skippedChecks = 0;

for (const entry of tasks) {
  const id = entry.id;
  if (!id) {
    console.error("::error::Manifest task missing id");
    failed++;
    continue;
  }

  try {
    const taskPath = join(tasksDir, `${id}.yml`);
    if (!existsSync(taskPath)) {
      throw new Error(`Missing task file: evals/e2e-bench/tasks/${id}.yml`);
    }

    const task = parseSimpleYaml(taskPath);
    for (const field of ["id", "class", "description", "acceptance"]) {
      if (!task[field] || (Array.isArray(task[field]) && task[field].length === 0)) {
        throw new Error(`${id}.yml missing ${field}`);
      }
    }
    if (task.id !== entry.id) {
      throw new Error(`${id}.yml id does not match manifest`);
    }
    if (entry.class && task.class !== entry.class) {
      throw new Error(`${id}.yml class does not match manifest`);
    }
    if (entry.stack && task.stack !== entry.stack) {
      throw new Error(`${id}.yml stack does not match manifest`);
    }

    const counters = { executed: 0, skipped: 0 };
    for (const spec of task.verification_commands || []) {
      runCommandSpec(spec, id, counters);
    }
    for (const spec of task.verification_contains || []) {
      runContainsSpec(spec, id, counters, false);
    }
    for (const spec of task.verification_not_contains || []) {
      runContainsSpec(spec, id, counters, true);
    }

    if (counters.executed === 0 && counters.skipped === 0) {
      throw new Error(`${id}.yml has no executable verification checks`);
    }

    executedChecks += counters.executed;
    skippedChecks += counters.skipped;
    console.log(
      `E2E ${id}: ok (${counters.executed} check(s) executed${counters.skipped ? `, ${counters.skipped} skipped` : ""})`,
    );
  } catch (error) {
    failed++;
    console.error(`::error::${error.message}`);
  }
}

if (failed > 0) {
  console.error(`E2E bench failed: ${failed} task(s) invalid or non-compliant`);
  process.exit(1);
}

console.log(
  `E2E bench: ${tasks.length} task(s), ${executedChecks} executed check(s), ${skippedChecks} skipped`,
);
