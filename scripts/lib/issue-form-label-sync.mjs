const TASK_CLASS_LABELS = new Map([
  ["docs", "task:docs"],
  ["test-fix", "task:test-fix"],
  ["refactor", "task:refactor"],
  ["feature-small", "task:feature-small"],
  ["dependency-bump", "task:dependency-bump"],
  ["infra", "task:infra"],
  ["security-sensitive", "task:security-sensitive"],
]);

const AUTONOMY_LABELS = new Map([
  ["L0", "autonomy:L0"],
  ["L1", "autonomy:L1"],
  ["L2", "autonomy:L2"],
  ["L3", "autonomy:L3"],
]);

function extractHeadingValue(body, heading) {
  const pattern = new RegExp(`^### ${heading}\\s*\\n+([\\s\\S]*?)(?=\\n^### |$)`, "m");
  const match = body.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function parseTaskIssueSelections(body = "") {
  const taskClass = extractHeadingValue(body, "Task class").split("\n")[0].trim();
  const autonomy = extractHeadingValue(body, "Max autonomy level").split("\n")[0].trim();

  return {
    taskClass,
    autonomy,
    taskLabel: TASK_CLASS_LABELS.get(taskClass) ?? "",
    autonomyLabel: AUTONOMY_LABELS.get(autonomy) ?? "",
    isTaskIssue: body.includes("### Goal") && body.includes("### Task class") && body.includes("### Max autonomy level"),
  };
}

export function planIssueLabels(existingLabels = [], parsed) {
  const keep = existingLabels.filter((label) => !label.startsWith("task:") && !label.startsWith("autonomy:"));
  if (!parsed.taskLabel || !parsed.autonomyLabel) {
    return {
      labels: existingLabels,
      changed: false,
      reason: "task issue selections could not be resolved",
    };
  }

  const labels = [...keep, parsed.taskLabel, parsed.autonomyLabel];
  const changed =
    labels.length !== existingLabels.length || labels.some((label, index) => label !== existingLabels[index]);

  return {
    labels,
    changed,
    reason: changed ? "updated labels from Issue form selections" : "labels already matched Issue form selections",
  };
}
