/**
 * gh-aw dogfood validation track for sdlc-gh itself.
 * See docs/gh-aw-dogfood.md.
 */

export const DOGFOOD_TASK_LABEL = "task:gh-aw-dogfood";

/** Markdown sources and compiled lock files under validation */
export const GH_AW_SOURCE_WORKFLOWS = [
  {
    id: "nightly-harness-review",
    md: ".github/workflows/nightly-harness-review.md",
    lock: ".github/workflows/nightly-harness-review.lock.yml",
  },
  {
    id: "weekly-redteam",
    md: ".github/workflows/weekly-redteam.md",
    lock: ".github/workflows/weekly-redteam.lock.yml",
  },
];

/**
 * Paths that may change during a dogfood task (narrow, reviewable scope).
 * @type {readonly string[]}
 */
export const DOGFOOD_ALLOWED_PATH_PREFIXES = [
  ".github/workflows/nightly-harness-review.md",
  ".github/workflows/nightly-harness-review.lock.yml",
  ".github/workflows/weekly-redteam.md",
  ".github/workflows/weekly-redteam.lock.yml",
  ".github/workflows/gh-aw-dogfood-ci.yml",
  ".github/labels.yml",
  ".github/aw/",
  "scripts/lib/gh-aw-dogfood.mjs",
  "scripts/check-gh-aw-dogfood-scope.mjs",
  "scripts/validate-gh-aw-compile.mjs",
  "scripts/emit-gh-aw-dogfood-report.mjs",
  "scripts/test-gh-aw-dogfood-scenarios.mjs",
  "docs/gh-aw-dogfood.md",
  "docs/nightly-harness-review.md",
  "infra/samples/gh-aw-dogfood-report.json",
];

export const DOGFOOD_EVALUATION_CRITERIA = [
  "scope",
  "safe_outputs",
  "compile",
  "lock_drift",
  "reviewability",
];

export const GH_AW_SOURCE_REQUIRED_SECTIONS = {
  "nightly-harness-review": [
    "## Required inputs",
    "## Forbidden operations",
    "## Expected outputs",
    "## Fallback when gh-aw regresses",
    "## Promotion criteria",
  ],
  "weekly-redteam": [
    "## Required inputs",
    "## Forbidden operations",
    "## Expected outputs",
    "## Fallback when gh-aw or garak regresses",
    "## Promotion criteria",
  ],
};

/**
 * @param {string} content
 * @param {string} workflowId
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateGhAwSourceSections(content, workflowId) {
  const required = GH_AW_SOURCE_REQUIRED_SECTIONS[workflowId] ?? [];
  const missing = required.filter((section) => !String(content).includes(section));
  return { ok: missing.length === 0, missing };
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isDogfoodAllowedPath(path) {
  const normalized = String(path).replace(/^\.\//, "");
  return DOGFOOD_ALLOWED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix),
  );
}

/**
 * @param {string[]} changedFiles
 * @returns {string[]}
 */
export function findOutOfScopePaths(changedFiles) {
  return changedFiles.filter((file) => !isDogfoodAllowedPath(file));
}

/**
 * Parse comma-separated PR label names (GITHUB event payload style).
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseDogfoodLabels(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Scope is enforced only when `task:gh-aw-dogfood` is set (matches check-gh-aw-dogfood-scope).
 * @param {string[]} changedFiles
 * @param {string[]} labels
 * @returns {{ ok: boolean, issues: string[], enforced: boolean }}
 */
export function evaluateDogfoodScope(changedFiles, labels = []) {
  const enforced = labels.includes(DOGFOOD_TASK_LABEL);
  if (!enforced) {
    return { ok: true, issues: [], enforced: false };
  }
  const outOfScope = findOutOfScopePaths(changedFiles);
  return {
    ok: outOfScope.length === 0,
    issues: outOfScope.map((file) => `out of scope: ${file}`),
    enforced: true,
  };
}

/**
 * @param {string} block
 * @returns {Record<string, unknown>}
 */
function parseSafeOutputsBlock(block) {
  const result = {};
  let current = null;
  for (const line of String(block).split("\n")) {
    const level1 = line.match(/^  ([\w-]+):\s*(.*)$/);
    if (level1) {
      current = level1[1];
      const value = level1[2].trim();
      result[current] = value ? (/^\d+$/.test(value) ? Number(value) : value) : {};
      continue;
    }
    const level2 = line.match(/^    ([\w-]+):\s*(.*)$/);
    if (level2 && current) {
      if (typeof result[current] !== "object" || result[current] === null) {
        result[current] = {};
      }
      const value = level2[2].trim();
      result[current][level2[1]] = /^\d+$/.test(value) ? Number(value) : value;
    }
  }
  return result;
}

/**
 * @param {string} content
 * @returns {{ raw: string, fields: Record<string, unknown>, body: string } | null}
 */
export function parseGhAwWorkflowMarkdown(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const fmText = match[1];
  const fields = {};
  for (const line of fmText.split("\n")) {
    const top = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!top || line.startsWith(" ")) continue;
    const value = top[2].trim().replace(/^['"]|['"]$/g, "");
    fields[top[1]] = value || true;
  }

  const safeMatch = fmText.match(/safe-outputs:\s*\n([\s\S]*?)(?=\n[a-z].*:|$)/i);
  if (safeMatch) {
    fields["safe-outputs"] = parseSafeOutputsBlock(safeMatch[1]);
  }

  return { raw: fmText, fields, body: match[2] };
}

/**
 * @param {Record<string, unknown>} frontmatterFields
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function validateSafeOutputs(frontmatterFields) {
  const issues = [];
  const safeOutputs = frontmatterFields["safe-outputs"];
  if (!safeOutputs || typeof safeOutputs !== "object") {
    issues.push("safe-outputs block missing");
    return { ok: false, issues };
  }

  const pr = safeOutputs["create-pull-request"];
  if (pr && typeof pr === "object") {
    const max = Number(pr.max ?? 0);
    if (max > 1) issues.push("create-pull-request.max must be <= 1 for dogfood");
  }

  const forbidden = ["auto-merge", "merge-pull-request"];
  for (const key of forbidden) {
    if (safeOutputs[key]) issues.push(`forbidden safe-output: ${key}`);
  }

  return { ok: issues.length === 0, issues };
}

/**
 * @param {string} lockContent
 * @returns {Record<string, unknown> | null}
 */
export function parseGhAwLockMetadata(lockContent) {
  const line = String(lockContent).split("\n").find((l) => l.startsWith("# gh-aw-metadata:"));
  if (!line) return null;
  const json = line.slice("# gh-aw-metadata:".length).trim();
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {typeof GH_AW_SOURCE_WORKFLOWS} workflows
 * @returns {Record<string, { ok: boolean, issues: string[] }>}
 */
export function evaluateSafeOutputsForWorkflows(readFile, workflows = GH_AW_SOURCE_WORKFLOWS) {
  const results = {};
  for (const wf of workflows) {
    const content = readFile(wf.md);
    const parsed = parseGhAwWorkflowMarkdown(content);
    if (!parsed) {
      results[wf.id] = { ok: false, issues: ["missing YAML frontmatter"] };
      continue;
    }
    results[wf.id] = validateSafeOutputs(parsed.fields);
  }
  return results;
}

/**
 * @param {object} input
 * @returns {Record<string, unknown>}
 */
export function buildDogfoodReport({
  scope = { ok: true, issues: [] },
  safeOutputs = {},
  compile = { ok: true, skipped: false, issues: [] },
  lockDrift = { ok: true, issues: [] },
  repo = "unknown/unknown",
}) {
  const safeOk = Object.values(safeOutputs).every((r) => r.ok);
  const criteria = {
    scope: { pass: scope.ok, issues: scope.issues },
    safe_outputs: {
      pass: safeOk,
      workflows: safeOutputs,
    },
    compile: {
      pass: compile.ok,
      skipped: compile.skipped ?? false,
      issues: compile.issues ?? [],
    },
    lock_drift: {
      pass: lockDrift.ok,
      issues: lockDrift.issues ?? [],
    },
    reviewability: {
      pass: scope.ok && safeOk && lockDrift.ok && (compile.ok || compile.skipped),
      note: "Outputs limited to PRs, summaries, compile results, or issues — no auto-merge",
    },
  };

  const pass = Object.entries(criteria)
    .filter(([key]) => key !== "reviewability")
    .every(([key, value]) => value.pass || (key === "compile" && value.skipped));

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    repo,
    track: "gh-aw-dogfood",
    pass,
    criteria,
    rollback: {
      trigger:
        "gh-aw preview regression, compile failure, or safe-output policy breach on dogfood track",
      action: "Revert .md/.lock.yml pair and disable gh-aw-dogfood-ci until upstream fix; keep GHA outer loop",
      doc: "docs/gh-aw-dogfood.md#rollback",
    },
  };
}
