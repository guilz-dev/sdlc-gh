#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateManifest } from "./lib/e2e-manifest.mjs";

const baseManifest = {
  version: 1,
  min_tasks: 3,
  last_rotated: "2026-07-04T00:00:00Z",
  tasks: [
    { id: "e2e-001", class: "docs" },
    { id: "e2e-002", class: "test-fix" },
    { id: "e2e-003", class: "refactor" },
  ],
};

const ok = validateManifest(baseManifest, ["e2e-001", "e2e-002", "e2e-003"]);
assert.equal(ok.errors.length, 0);

const duplicate = validateManifest(
  {
    ...baseManifest,
    tasks: [
      { id: "e2e-001", class: "docs" },
      { id: "e2e-001", class: "docs" },
      { id: "e2e-002", class: "test-fix" },
    ],
  },
  ["e2e-001", "e2e-002"],
);
assert.ok(duplicate.errors.some((e) => e.includes("Duplicate")));

const missingFile = validateManifest(baseManifest, ["e2e-001", "e2e-002"]);
assert.ok(missingFile.errors.some((e) => e.includes("Missing task file")));

const orphan = validateManifest(baseManifest, ["e2e-001", "e2e-002", "e2e-003", "e2e-099"]);
assert.ok(orphan.errors.some((e) => e.includes("Orphan")));

const unsupported = validateManifest(
  {
    ...baseManifest,
    tasks: [{ id: "e2e-001", class: "unknown-class" }],
  },
  ["e2e-001"],
);
assert.ok(unsupported.errors.some((e) => e.includes("Unsupported")));

const belowMin = validateManifest(
  { ...baseManifest, min_tasks: 5, tasks: [{ id: "e2e-001", class: "docs" }] },
  ["e2e-001"],
);
assert.ok(belowMin.errors.some((e) => e.includes("at least 5")));

const missingRotation = validateManifest(
  { ...baseManifest, last_rotated: undefined },
  ["e2e-001", "e2e-002", "e2e-003"],
);
assert.ok(missingRotation.errors.some((e) => e.includes("last_rotated")));

const invalidRotation = validateManifest(
  { ...baseManifest, last_rotated: "not-a-date" },
  ["e2e-001", "e2e-002", "e2e-003"],
);
assert.ok(invalidRotation.errors.some((e) => e.includes("invalid last_rotated")));

console.log("E2E manifest scenario tests passed");
