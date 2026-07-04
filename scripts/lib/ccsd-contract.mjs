/**
 * Canonical CC-SD contract — single source of truth for field names.
 * Used by CI validation, regression tests, and template alignment checks.
 */

/** @type {readonly string[]} */
export const CCSD_REQUIRED_FIELDS = [
  "Goal",
  "Non-goals",
  "Constraints",
  "Acceptance criteria",
  "Rollback hints",
];

/** @type {readonly string[]} */
export const CCSD_OPTIONAL_FIELDS = ["Additional context"];

/** @type {readonly string[]} */
export const CCSD_ALL_FIELDS = [...CCSD_REQUIRED_FIELDS, ...CCSD_OPTIONAL_FIELDS];

/** L1 task classes that require a complete CC-SD contract in v1. */
export const CCSD_ENFORCED_TASK_CLASSES = ["docs", "test-fix"];

/** PR template summary fields that mirror the Issue contract. */
export const CCSD_PR_SUMMARY_FIELDS = [
  "Goal implemented",
  "Non-goals preserved",
  "Constraints handled",
  "Acceptance criteria",
  "Rollback",
];

/**
 * Placeholder text from the Issue template — treated as missing content.
 * @type {readonly string[]}
 */
export const CCSD_PLACEHOLDER_SNIPPETS = [
  "One short paragraph describing what this task achieves.",
  "- Item the task must not do or change",
  "- Technical or policy limits (stack, paths, time)",
  "- [ ] Criterion 1",
  "- [ ] Criterion 2",
  "How to revert this change immediately if needed.",
];

/**
 * Parse GitHub Issue form body sections (### Label headers).
 * @param {string} body
 * @returns {Record<string, string>}
 */
export function parseIssueSections(body) {
  const sections = {};
  if (!body?.trim()) return sections;

  const parts = body.split(/^### /m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n");
    if (newline === -1) continue;
    const title = part.slice(0, newline).trim();
    const content = part.slice(newline + 1).trim();
    sections[title] = content;
  }
  return sections;
}

function normalizeLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function isPlaceholderLine(line) {
  const normalized = normalizeLine(line);
  if (!normalized) return true;
  return CCSD_PLACEHOLDER_SNIPPETS.some((snippet) => normalized === snippet);
}

/**
 * @param {string} content
 * @returns {boolean}
 */
export function isPlaceholderContent(content) {
  if (!content?.trim()) return true;

  const stripped = content.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!stripped) return true;

  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\-\s*\[\s*\]\s*$/.test(line));

  if (lines.length === 0) return true;

  // Single paragraph (Goal, Rollback hints): exact match only — extra text is valid.
  if (lines.length === 1 && !lines[0].startsWith("-")) {
    return isPlaceholderLine(lines[0]);
  }

  // Bullet lists: placeholder-only when every remaining line is a template snippet.
  return lines.every((line) => isPlaceholderLine(line));
}

/**
 * Validate CC-SD fields in an Issue body.
 * @param {string} issueBody
 * @returns {{ ok: boolean, missing: string[], placeholder: string[] }}
 */
export function validateCcsdFields(issueBody) {
  const sections = parseIssueSections(issueBody);
  const missing = [];
  const placeholder = [];

  for (const field of CCSD_REQUIRED_FIELDS) {
    const content = sections[field];
    if (!content?.trim()) {
      missing.push(field);
    } else if (isPlaceholderContent(content)) {
      placeholder.push(field);
    }
  }

  return {
    ok: missing.length === 0 && placeholder.length === 0,
    missing,
    placeholder,
  };
}

/**
 * Whether CC-SD enforcement applies for the given labels.
 * @param {string[]} labels
 * @returns {boolean}
 */
export function shouldEnforceCcsd(labels) {
  const normalized = labels.map((l) => l.trim());
  const taskLabels = normalized
    .filter((l) => l.startsWith("task:"))
    .map((l) => l.replace(/^task:/, ""));
  if (taskLabels.length !== 1) return false;

  const isL1 = normalized.some((l) => l === "autonomy:L1");
  return isL1 && CCSD_ENFORCED_TASK_CLASSES.includes(taskLabels[0]);
}

/**
 * @param {string[]} labels
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateLabelShape(labels) {
  const normalized = labels.map((l) => l.trim());
  const taskLabels = normalized.filter((l) => l.startsWith("task:"));
  const autonomyLabels = normalized.filter((l) => l.startsWith("autonomy:"));

  if (taskLabels.length > 1) {
    return {
      ok: false,
      message: `Issue has multiple task:* labels (${taskLabels.join(", ")}); keep exactly one`,
    };
  }
  if (autonomyLabels.length > 1) {
    return {
      ok: false,
      message: `Issue has multiple autonomy:* labels (${autonomyLabels.join(", ")}); keep exactly one`,
    };
  }
  return { ok: true };
}

/**
 * When linked Issues cannot be fetched, fail only if proxy labels indicate L1 docs/test-fix.
 * @param {string[]} proxyLabels - Issue labels, or PR labels as fallback
 * @returns {"fail" | "warn_skip"}
 */
export function resolveFetchFailureAction(proxyLabels) {
  return shouldEnforceCcsd(proxyLabels) ? "fail" : "warn_skip";
}

/**
 * Extract issue numbers from PR closing keywords (fixes #N, closes #N, …).
 * Bare #N mentions are ignored to avoid matching unrelated references.
 * @param {string} body
 * @returns {number[]}
 */
export function extractClosingIssueNumbers(body) {
  if (!body) return [];
  const numbers = new Set();
  const pattern = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  for (const match of body.matchAll(pattern)) {
    numbers.add(Number(match[1]));
  }
  return [...numbers];
}

/**
 * Pick the Issue to validate when a PR links multiple Issues.
 * Prefers the single L1 docs/test-fix candidate; flags ambiguity when several match.
 * @param {{ body: string, labels: string[], issueNumber: number }[]} issues
 * @returns {{ kind: "none" } | { kind: "ambiguous", issueNumbers: number[] } | { kind: "issue", body: string, labels: string[], issueNumber: number }}
 */
export function pickLinkedIssue(issues) {
  if (!issues?.length) return { kind: "none" };

  const enforced = issues.filter((issue) => shouldEnforceCcsd(issue.labels));
  if (enforced.length > 1) {
    return {
      kind: "ambiguous",
      issueNumbers: enforced.map((issue) => issue.issueNumber),
    };
  }
  if (enforced.length === 1) return { kind: "issue", ...enforced[0] };

  return { kind: "issue", ...issues[0] };
}
