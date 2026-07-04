/**
 * Route nightly harness review classifications into GitHub issues.
 * See docs/nightly-harness-review.md and docs/failure-taxonomy.md (#4).
 */

export const ROUTING_SCHEMA_VERSION = "1";
export const ROUTING_MARKER_PREFIX = "harness-routing-key:";

export const ISSUE_KIND = {
  HARNESS_REVISION: "harness-revision",
  WALL_ADDITION: "wall-addition",
};

/** @type {Record<string, string[]>} */
export const ISSUE_LABELS = {
  [ISSUE_KIND.HARNESS_REVISION]: ["outer-loop:harness-revision", "autonomy:L0"],
  [ISSUE_KIND.WALL_ADDITION]: ["outer-loop:wall-addition", "autonomy:L0"],
};

/**
 * @param {string} repo
 * @param {string} kind
 * @param {string} signature
 * @param {string} scope
 * @returns {string}
 */
export function routingDedupeKey(repo, kind, signature, scope) {
  return `${repo}:${kind}:${signature}:${scope}`;
}

/**
 * @param {string} dedupeKey
 * @returns {string}
 */
export function routingMarker(dedupeKey) {
  return `<!-- ${ROUTING_MARKER_PREFIX}${dedupeKey} -->`;
}

/**
 * @param {string} body
 * @param {string} dedupeKey
 * @returns {boolean}
 */
export function bodyHasRoutingMarker(body, dedupeKey) {
  return String(body || "").includes(routingMarker(dedupeKey));
}

/**
 * @param {Record<string, unknown>} summary
 * @returns {boolean}
 */
export function hasRepeatedFfFindings(summary) {
  const items = (summary.classifications ?? []).filter((c) => c.classification === "FF不足");
  if (items.length >= 2) return true;
  const sigs = summary.rollup?.repeated_failure_signatures ?? [];
  return sigs.some(
    (s) => s.wall_failure_type === "lint" && Number(s.record_count) >= 2,
  );
}

/**
 * @param {Record<string, unknown>} summary
 * @returns {boolean}
 */
export function hasRepeatedWallFindings(summary) {
  const items = (summary.classifications ?? []).filter((c) => c.classification === "壁不足");
  if (items.length >= 2) return true;
  const proxy = Number(summary.rollup?.review_rejection_proxy_count ?? 0);
  return proxy >= 1 && items.length >= 1;
}

/**
 * @param {Record<string, unknown>[]} items
 * @returns {string}
 */
export function inferRoutingScope(items) {
  const taskClasses = [...new Set(items.map((item) => String(item.task_class || "")).filter(Boolean))].sort();
  const wallTypes = [...new Set(items.flatMap((item) => item.wall_failure_types ?? []).map(String).filter(Boolean))].sort();

  if (taskClasses.length === 1 && wallTypes.length === 1) {
    return `task:${taskClasses[0]}|wall:${wallTypes[0]}`;
  }
  if (taskClasses.length === 1) {
    return `task:${taskClasses[0]}`;
  }
  if (taskClasses.length > 1) {
    return `tasks:${taskClasses.join("+")}`;
  }
  if (wallTypes.length === 1) {
    return `wall:${wallTypes[0]}`;
  }
  if (wallTypes.length > 1) {
    return `walls:${wallTypes.join("+")}`;
  }
  return "unknown-scope";
}

/**
 * @param {Record<string, unknown>} summary
 * @param {string} kind
 * @param {Record<string, unknown>[]} items
 * @param {string} signature
 * @returns {Record<string, unknown>}
 */
export function buildIssueAction(summary, kind, items, signature) {
  const repo = String(summary.repo ?? "unknown/unknown");
  const scope = inferRoutingScope(items);
  const dedupeKey = routingDedupeKey(repo, kind, signature, scope);
  const windowHours = summary.window_hours ?? 24;
  const marker = routingMarker(dedupeKey);

  const title =
    kind === ISSUE_KIND.HARNESS_REVISION
      ? `[outer-loop] Harness revision needed (${signature} / ${scope})`
      : `[outer-loop] Wall addition needed (${signature} / ${scope})`;

  const lines = [
    marker,
    "",
    "## Summary",
    "",
    `Nightly harness review (${windowHours}h window) routed **${kind}** work.`,
    "",
    `Generated: ${summary.generated_at}`,
    `Repository: ${repo}`,
    `Scope: ${scope}`,
    "",
    "## Evidence",
    "",
    "| task_id | pr | rationale | wall_failure_types |",
    "|---------|----|-----------|--------------------|",
  ];

  for (const item of items) {
    const walls = (item.wall_failure_types ?? []).join(", ") || "—";
    lines.push(
      `| ${item.task_id} | ${item.pr_number} | ${item.rationale} | ${walls} |`,
    );
  }

  lines.push(
    "",
    "## Suggested next steps",
    "",
    kind === ISSUE_KIND.HARNESS_REVISION
      ? "- Update instructions / skills / agents for repeated convention gaps\n- Link eval or telemetry evidence in follow-up PRs"
      : "- Add tests, lint rules, or contracts so CI catches review findings\n- Keep proposal PRs at `autonomy:L0` until walls are updated",
    "",
    "## Rollback",
    "",
    "Close this issue if the signature does not recur in the next nightly window.",
    "",
    "Automated by `scripts/route-harness-review.mjs` (issue #4).",
  );

  return {
    action: "open_or_update_issue",
    kind,
    dedupe_key: dedupeKey,
    signature,
    scope,
    labels: ISSUE_LABELS[kind] ?? [],
    title,
    body: `${lines.join("\n")}\n`,
    evidence_count: items.length,
  };
}

/**
 * @param {Record<string, unknown>} summary
 * @returns {Record<string, unknown>}
 */
export function buildRoutingPlan(summary) {
  const actions = [];
  const skipped = [];

  const ffItems = (summary.classifications ?? []).filter((c) => c.classification === "FF不足");
  const wallItems = (summary.classifications ?? []).filter((c) => c.classification === "壁不足");

  if (hasRepeatedFfFindings(summary) && ffItems.length > 0) {
    const signature = (summary.rollup?.repeated_failure_signatures ?? []).some(
      (s) => s.wall_failure_type === "lint",
    )
      ? "lint"
      : "ff-aggregate";
    actions.push(buildIssueAction(summary, ISSUE_KIND.HARNESS_REVISION, ffItems, signature));
  } else if (ffItems.length) {
    skipped.push({ kind: ISSUE_KIND.HARNESS_REVISION, reason: "FF不足 present but not repeated" });
  } else if (hasRepeatedFfFindings(summary)) {
    skipped.push({
      kind: ISSUE_KIND.HARNESS_REVISION,
      reason: "lint signature repeated without FF不足 classification rows",
    });
  }

  if (hasRepeatedWallFindings(summary) && wallItems.length > 0) {
    const signature =
      Number(summary.rollup?.review_rejection_proxy_count ?? 0) >= 1
        ? "ci-pass-review-reject"
        : "wall-aggregate";
    actions.push(buildIssueAction(summary, ISSUE_KIND.WALL_ADDITION, wallItems, signature));
  } else if (wallItems.length) {
    skipped.push({ kind: ISSUE_KIND.WALL_ADDITION, reason: "壁不足 present but not repeated" });
  } else if (hasRepeatedWallFindings(summary)) {
    skipped.push({
      kind: ISSUE_KIND.WALL_ADDITION,
      reason: "review-rejection proxy without 壁不足 classification rows",
    });
  }

  return {
    schema_version: ROUTING_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source_summary_at: summary.generated_at ?? null,
    repo: summary.repo ?? "unknown/unknown",
    actions,
    skipped,
  };
}

/**
 * @param {Record<string, unknown>} plan
 * @param {{ existingIssues?: { number: number, body: string }[] }} [ctx]
 * @returns {Record<string, unknown>}
 */
export function applyRoutingPlanDryRun(plan, ctx = {}) {
  const existing = ctx.existingIssues ?? [];
  const results = [];

  for (const action of plan.actions ?? []) {
    const match = existing.find((issue) =>
      bodyHasRoutingMarker(issue.body, action.dedupe_key),
    );
    results.push({
      dedupe_key: action.dedupe_key,
      kind: action.kind,
      operation: match ? "update_issue" : "create_issue",
      issue_number: match?.number ?? null,
      title: action.title,
    });
  }

  return { ...plan, results };
}
