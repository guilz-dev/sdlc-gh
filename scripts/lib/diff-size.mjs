/** Pure helpers for diff-size / autonomy gate (testable without git). */

export const LIMITS = {
  L1: { loc: 300, files: 8 },
  L2: { loc: 120, files: 4 },
  L3: { loc: 60, files: 2 },
};

export const SENSITIVE_PATH_PREFIXES = [".github/workflows/", "infra/"];

export function parseLabelInput(input) {
  return String(input || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveAutonomyLevel(labels) {
  if (labels.some((l) => l.includes("autonomy:L3"))) return "L3";
  if (labels.some((l) => l.includes("autonomy:L2"))) return "L2";
  if (labels.some((l) => l.includes("autonomy:L0"))) return "L0";
  return "L1";
}

export function resolveLimits(level) {
  if (level === "L0") return null;
  return LIMITS[level] ?? LIMITS.L1;
}

export function resolveEnforcementMode(level, { l1HardFail = false } = {}) {
  if (level === "L0") return "proposal-only";
  if (level === "L2" || level === "L3") return "hard-fail";
  if (level === "L1" && l1HardFail) return "hard-fail";
  return "warn";
}

export function aggregateDiffStats(numstatText) {
  let add = 0;
  let del = 0;
  let files = 0;

  for (const line of String(numstatText).split("\n").filter(Boolean)) {
    const [a, d] = line.split("\t");
    if (a === "-" && d === "-") continue;
    add += Number(a) || 0;
    del += Number(d) || 0;
    files += 1;
  }

  return { add, del, loc: add + del, files };
}

export function isOverLimit(stats, limits) {
  if (!limits) return false;
  return stats.loc > limits.loc || stats.files > limits.files;
}

export function formatSummary(level, stats, limits) {
  if (!limits) {
    return `Autonomy: ${level} | LOC: ${stats.loc} | Files: ${stats.files} (proposal only)`;
  }
  return `Autonomy: ${level} | LOC: ${stats.loc}/${limits.loc} | Files: ${stats.files}/${limits.files}`;
}

export function formatOverLimitMessage(level) {
  return `Change size exceeds ${level} limits`;
}

export function findSensitivePathWarnings(diffFiles, labels) {
  const hasInfra = labels.some((l) => l.includes("task:infra"));
  const warnings = [];
  for (const file of diffFiles) {
    if (SENSITIVE_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)) && !hasInfra) {
      warnings.push(`${file} changed without task:infra label`);
    }
  }
  return warnings;
}

export function evaluateDiffSize({
  labels,
  numstatText,
  diffFiles = [],
  l1HardFail = false,
}) {
  const level = resolveAutonomyLevel(labels);
  const limits = resolveLimits(level);
  const mode = resolveEnforcementMode(level, { l1HardFail });
  const stats = aggregateDiffStats(numstatText);
  const overLimit = isOverLimit(stats, limits);
  const sensitiveWarnings = findSensitivePathWarnings(diffFiles, labels);

  return {
    level,
    limits,
    mode,
    stats,
    overLimit,
    sensitiveWarnings,
    summary: formatSummary(level, stats, limits),
    overLimitMessage: overLimit ? formatOverLimitMessage(level) : null,
  };
}
