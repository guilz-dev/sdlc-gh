/** Pure validation for e2e-bench manifest (testable without filesystem). */

export const SUPPORTED_CLASSES = [
  "docs",
  "test-fix",
  "refactor",
  "feature-small",
  "dependency-bump",
  "infra",
  "security-sensitive",
];

const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;

export function validateLastRotated(lastRotated) {
  if (!lastRotated) {
    return { valid: false, message: "manifest missing last_rotated" };
  }
  const parsed = new Date(lastRotated);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, message: `invalid last_rotated: ${lastRotated}` };
  }
  const stale = Date.now() - parsed.getTime() > QUARTER_MS;
  return { valid: true, stale, parsed };
}

export function validateManifest(manifest, taskFileIds = []) {
  const errors = [];
  const warnings = [];
  const tasks = manifest.tasks || [];
  const minTasks = manifest.min_tasks ?? 5;
  const fileIdSet = new Set(taskFileIds);

  if (tasks.length < minTasks) {
    errors.push(`Need at least ${minTasks} e2e tasks (found ${tasks.length})`);
  }

  const rotation = validateLastRotated(manifest.last_rotated);
  if (!rotation.valid) {
    errors.push(rotation.message);
  } else if (rotation.stale) {
    warnings.push("E2E bench not rotated in 90 days — review manifest");
  }

  const seenIds = new Set();
  const manifestIds = new Set();

  for (const entry of tasks) {
    const id = entry?.id;
    if (!id) {
      errors.push("Manifest task missing id");
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`Duplicate manifest task id: ${id}`);
    }
    seenIds.add(id);
    manifestIds.add(id);

    if (!fileIdSet.has(id)) {
      errors.push(`Missing task file: evals/e2e-bench/tasks/${id}.yml`);
    }

    if (entry.class && !SUPPORTED_CLASSES.includes(entry.class)) {
      errors.push(`Unsupported task class for ${id}: ${entry.class}`);
    }
  }

  for (const fileId of taskFileIds) {
    if (!manifestIds.has(fileId)) {
      errors.push(`Orphan task file not listed in manifest: ${fileId}.yml`);
    }
  }

  return { errors, warnings, taskCount: tasks.length, minTasks };
}
