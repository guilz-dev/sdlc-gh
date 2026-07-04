/**
 * Nightly harness review — aggregate telemetry artifacts and classify failures.
 * See docs/failure-taxonomy.md and docs/nightly-harness-review.md.
 */

export const REVIEW_SCHEMA_VERSION = "1";
export const REVIEW_OUT_DIR = "harness-review";
export const MAX_RETRIES = 3;

/** @type {readonly string[]} */
export const FAILURE_CLASSES = ["FF不足", "壁不足", "モデル限界", "unclassified"];

const FF_WALL_TYPES = new Set(["lint"]);

/** Wall types that usually indicate model / execution limits when repeated */
const MODEL_LIMIT_WALL_TYPES = new Set(["test", "type", "security", "safe-output", "diff-size"]);

/**
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
export function telemetryDedupeKey(record) {
  const payload = record.payload ?? {};
  return `${record.workflow_run_id}:${record.source}:${payload.pr_number}`;
}

/**
 * @param {Record<string, unknown>[]} records
 * @returns {Record<string, unknown>[]}
 */
export function dedupeTelemetryRecords(records) {
  const seen = new Map();
  for (const record of records) {
    const key = telemetryDedupeKey(record);
    const existing = seen.get(key);
    if (!existing || String(record.emitted_at) > String(existing.emitted_at)) {
      seen.set(key, record);
    }
  }
  return [...seen.values()];
}

/**
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
export function taskGroupKey(record) {
  const payload = record.payload ?? {};
  return `${payload.repo}|${payload.task_id}|${payload.pr_number}`;
}

/**
 * @param {Record<string, unknown>[]} records
 * @returns {Map<string, Record<string, unknown>[]>}
 */
export function groupRecordsByTask(records) {
  const groups = new Map();
  for (const record of records) {
    const key = taskGroupKey(record);
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return groups;
}

/**
 * @param {string[]} values
 * @returns {Record<string, number>}
 */
export function countValues(values) {
  const counts = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {Record<string, unknown>[]} records
 * @returns {boolean}
 */
export function groupHasFailureSignal(records) {
  for (const record of records) {
    const payload = record.payload ?? {};
    if (payload.wall_failure_type) return true;
    if (payload.final_outcome === "escalated") return true;
    if (payload.review_outcome === "changes_requested") return true;
    if (Number(payload.retry_count) > 0) return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>[]} records
 * @returns {{ classification: string, rationale: string } | null}
 */
export function classifyTaskGroup(records) {
  if (!groupHasFailureSignal(records)) return null;

  const payloads = records.map((record) => ({
    source: record.source,
    ...(record.payload ?? {}),
  }));

  const maxRetry = Math.max(0, ...payloads.map((p) => Number(p.retry_count) || 0));
  const wallTypes = payloads.map((p) => String(p.wall_failure_type || "")).filter(Boolean);
  const wallCounts = countValues(wallTypes);
  const escalated = payloads.some((p) => p.final_outcome === "escalated");
  const reviewRejected = payloads.some((p) => p.review_outcome === "changes_requested");
  const harnessGreen = payloads.some((p) => p.source === "harness-ci" && !p.wall_failure_type);
  const retryEvents = records.filter((r) => r.source === "agent-retry-orchestrator");

  if (harnessGreen && reviewRejected) {
    return {
      classification: "壁不足",
      rationale: "Harness CI passed while review_outcome is changes_requested",
    };
  }

  if (escalated || maxRetry >= MAX_RETRIES) {
    return {
      classification: "モデル限界",
      rationale: `Retry budget exhausted or escalated (max_retry_count=${maxRetry})`,
    };
  }

  if (wallTypes.includes("security")) {
    return {
      classification: "モデル限界",
      rationale: "Security wall failures are not auto-retried",
    };
  }

  const lintFailures = wallTypes.filter((w) => FF_WALL_TYPES.has(w)).length;
  if (lintFailures >= 2) {
    return {
      classification: "FF不足",
      rationale: "Repeated lint or issue-spec convention failures",
    };
  }

  const repeatedWall = Object.entries(wallCounts).find(([, count]) => count >= 2);
  if (repeatedWall && retryEvents.length >= 2) {
    return {
      classification: "モデル限界",
      rationale: `Same wall_failure_type (${repeatedWall[0]}) across multiple retry events`,
    };
  }

  if (repeatedWall) {
    const [wallType] = repeatedWall;
    if (FF_WALL_TYPES.has(wallType)) {
      return {
        classification: "FF不足",
        rationale: `Repeated wall_failure_type ${wallType}`,
      };
    }
    if (MODEL_LIMIT_WALL_TYPES.has(wallType)) {
      return {
        classification: "モデル限界",
        rationale: `Repeated wall_failure_type ${wallType} after retries`,
      };
    }
    return {
      classification: "unclassified",
      rationale: `Repeated wall_failure_type ${wallType} without taxonomy mapping`,
    };
  }

  if (wallTypes.length > 0 || maxRetry > 0) {
    return {
      classification: "unclassified",
      rationale:
        wallTypes.length > 0
          ? `Single wall failure (${wallTypes[0]}) without repeat pattern`
          : `Retry activity (count=${maxRetry}) without wall_failure_type`,
    };
  }

  if (reviewRejected) {
    return {
      classification: "壁不足",
      rationale: "Review rejection without CI failure signal in telemetry",
    };
  }

  return null;
}

/**
 * @param {Map<string, Record<string, unknown[]>>} groups
 * @returns {Record<string, unknown>[]}
 */
export function buildRepeatedFailureSignatures(groups) {
  /** @type {Record<string, { record_count: number, task_ids: Set<string> }>} */
  const byWall = {};

  for (const groupRecords of groups.values()) {
    const wallCounts = countValues(
      groupRecords.map((r) => String((r.payload ?? {}).wall_failure_type || "")).filter(Boolean),
    );
    const taskId = String((groupRecords[0]?.payload ?? {}).task_id ?? "");

    for (const [wallType, count] of Object.entries(wallCounts)) {
      if (!byWall[wallType]) {
        byWall[wallType] = { record_count: 0, task_ids: new Set() };
      }
      byWall[wallType].record_count += count;
      if (taskId) byWall[wallType].task_ids.add(taskId);
    }
  }

  return Object.entries(byWall)
    .filter(([, stats]) => stats.record_count >= 2 || stats.task_ids.size >= 2)
    .map(([wall_failure_type, stats]) => ({
      wall_failure_type,
      record_count: stats.record_count,
      task_count: stats.task_ids.size,
      task_ids: [...stats.task_ids],
    }))
    .sort((a, b) => b.record_count - a.record_count);
}

/**
 * @param {Record<string, unknown>[]} records
 * @param {{ repo?: string, windowHours?: number, generatedAt?: string }} [options]
 * @returns {Record<string, unknown>}
 */
export function buildHarnessReviewSummary(records, options = {}) {
  const deduped = dedupeTelemetryRecords(records);
  const groups = groupRecordsByTask(deduped);
  const classifications = [];

  const wallFailureRollup = {};
  let retryExhaustionCount = 0;
  let reviewRejectionProxyCount = 0;

  for (const [, groupRecords] of groups) {
    const payloads = groupRecords.map((r) => r.payload ?? {});
    const wallTypes = [
      ...new Set(payloads.map((p) => String(p.wall_failure_type || "")).filter(Boolean)),
    ];
    for (const wallType of wallTypes) {
      wallFailureRollup[wallType] = (wallFailureRollup[wallType] ?? 0) + 1;
    }

    const maxRetry = Math.max(0, ...payloads.map((p) => Number(p.retry_count) || 0));
    const escalated = payloads.some((p) => p.final_outcome === "escalated");
    if (escalated || maxRetry >= MAX_RETRIES) retryExhaustionCount += 1;

    const harnessGreen = groupRecords.some(
      (r) => r.source === "harness-ci" && !(r.payload ?? {}).wall_failure_type,
    );
    const reviewRejected = payloads.some((p) => p.review_outcome === "changes_requested");
    if (harnessGreen && reviewRejected) reviewRejectionProxyCount += 1;

    const result = classifyTaskGroup(groupRecords);
    if (!result) continue;

    const sample = payloads[0] ?? {};
    classifications.push({
      repo: sample.repo,
      task_id: sample.task_id,
      pr_number: sample.pr_number,
      task_class: sample.task_class,
      autonomy_level: sample.autonomy_level,
      classification: result.classification,
      rationale: result.rationale,
      wall_failure_types: [...new Set(wallTypes)],
      max_retry_count: maxRetry,
      final_outcome: payloads.map((p) => p.final_outcome).find(Boolean) ?? "in_progress",
      review_outcome: payloads.map((p) => p.review_outcome).find((v) => v && v !== "pending") ?? "pending",
      sources: [...new Set(groupRecords.map((r) => r.source))],
      workflow_run_ids: [...new Set(groupRecords.map((r) => r.workflow_run_id).filter(Boolean))],
    });
  }

  const byClassification = countValues(classifications.map((item) => item.classification));
  const repeatedFailureSignatures = buildRepeatedFailureSignatures(groups);

  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    repo: options.repo ?? deduped[0]?.payload?.repo ?? "unknown/unknown",
    window_hours: Number(options.windowHours ?? 24),
    rollup: {
      telemetry_records: deduped.length,
      task_groups: groups.size,
      failure_groups: classifications.length,
      by_wall_failure_type: wallFailureRollup,
      repeated_failure_signatures: repeatedFailureSignatures,
      retry_exhaustion_count: retryExhaustionCount,
      review_rejection_proxy_count: reviewRejectionProxyCount,
      by_classification: byClassification,
    },
    classifications,
  };
}

/**
 * @param {Record<string, unknown>} summary
 * @returns {string}
 */
export function formatHarnessReviewMarkdown(summary) {
  const rollup = summary.rollup ?? {};
  const lines = [
    "# Nightly harness review",
    "",
    `Generated: ${summary.generated_at}`,
    `Repository: ${summary.repo}`,
    `Window: last ${summary.window_hours}h`,
    "",
    "## Rollup",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Telemetry records | ${rollup.telemetry_records ?? 0} |`,
    `| Task groups | ${rollup.task_groups ?? 0} |`,
    `| Classified failure groups | ${rollup.failure_groups ?? 0} |`,
    `| Retry exhaustion | ${rollup.retry_exhaustion_count ?? 0} |`,
    `| CI pass + review rejection proxy | ${rollup.review_rejection_proxy_count ?? 0} |`,
    "",
    "### By wall_failure_type",
    "",
  ];

  const wallTypes = rollup.by_wall_failure_type ?? {};
  const wallEntries = Object.entries(wallTypes);
  if (wallEntries.length === 0) {
    lines.push("_No wall failures in window._", "");
  } else {
    lines.push("| wall_failure_type | count |", "|-------------------|-------|");
    for (const [type, count] of wallEntries.sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push("");
  }

  const signatures = rollup.repeated_failure_signatures ?? [];
  lines.push("### Repeated failure signatures", "");
  if (signatures.length === 0) {
    lines.push("_No repeated failure signatures in window._", "");
  } else {
    lines.push("| wall_failure_type | record_count | task_count | task_ids |", "|---|---:|---:|---|");
    for (const sig of signatures) {
      const taskIds = (sig.task_ids ?? []).join(", ") || "—";
      lines.push(
        `| ${sig.wall_failure_type} | ${sig.record_count} | ${sig.task_count} | ${taskIds} |`,
      );
    }
    lines.push("");
  }

  lines.push("### By classification", "");
  const byClass = rollup.by_classification ?? {};
  const classEntries = Object.entries(byClass);
  if (classEntries.length === 0) {
    lines.push("_No classified failures in window._", "");
  } else {
    lines.push("| classification | count |", "|----------------|-------|");
    for (const [cls, count] of classEntries.sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${cls} | ${count} |`);
    }
    lines.push("");
  }

  lines.push("## Per-task classifications", "");
  const items = summary.classifications ?? [];
  if (items.length === 0) {
    lines.push("_No per-task classification records._");
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    "| task_id | pr | class | wall_failure_types | max_retry | rationale |",
    "|---------|----|-------|--------------------|-----------|-----------|",
  );
  for (const item of items) {
    const walls = (item.wall_failure_types ?? []).join(", ") || "—";
    lines.push(
      `| ${item.task_id} | ${item.pr_number} | ${item.classification} | ${walls} | ${item.max_retry_count} | ${item.rationale} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}
