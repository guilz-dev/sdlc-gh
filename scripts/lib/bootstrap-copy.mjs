/**
 * Canonical lists for bootstrap copy and validate-harness consistency checks.
 * Keep in sync with scripts/bootstrap-harness.sh copy loops.
 */

export const BOOTSTRAP_LIB_FILES = [
  "bootstrap-copy.mjs",
  "stacks.mjs",
  "harness-ci-fragments.mjs",
  "ccsd-contract.mjs",
  "github-config.mjs",
  "diff-size.mjs",
  "e2e-manifest.mjs",
  "doctor-local.mjs",
  "telemetry-artifact.mjs",
];

export const BOOTSTRAP_SCRIPT_MJS = [
  "validate-harness.mjs",
  "check-diff-size.mjs",
  "check-issue-spec.mjs",
  "select-eval-jobs.mjs",
  "check-e2e-manifest.mjs",
  "validate-telemetry.mjs",
  "emit-telemetry-artifact.mjs",
  "check-open-pr-limit.mjs",
  "test-hooks-scenarios.mjs",
  "test-issue-spec-scenarios.mjs",
  "test-diff-size-scenarios.mjs",
  "test-e2e-manifest-scenarios.mjs",
  "test-setup-github-scenarios.mjs",
  "test-doctor-scenarios.mjs",
  "test-telemetry-artifact-scenarios.mjs",
  "test-bootstrap-guidance-scenarios.mjs",
  "harness-drift-report.mjs",
  "check-eval-score-drift.mjs",
  "run-e2e-bench.mjs",
  "doctor.mjs",
  "setup-github.mjs",
  "trim-harness-ci.mjs",
];

export const BOOTSTRAP_SCRIPT_SH = [
  "bootstrap-harness.sh",
  "setup-github.sh",
  "verify-bootstrap-stacks.sh",
];

export const BOOTSTRAP_DOCS = [
  "operations.md",
  "adoption.md",
  "auth-boundaries.md",
  "failure-taxonomy.md",
  "telemetry-schema.md",
  "telemetry-artifacts.md",
  "shared-config.md",
  "coding-agent-l1.md",
  "kpi-baseline.md",
  "revert-playbook.md",
  "arch.md",
];

/** script entrypoint -> required lib/*.mjs basenames */
export const SCRIPT_LIB_IMPORTS = {
  "check-diff-size.mjs": ["diff-size.mjs"],
  "check-e2e-manifest.mjs": ["e2e-manifest.mjs"],
  "doctor.mjs": ["doctor-local.mjs", "github-config.mjs"],
  "setup-github.mjs": ["github-config.mjs", "stacks.mjs"],
  "test-diff-size-scenarios.mjs": ["diff-size.mjs"],
  "test-e2e-manifest-scenarios.mjs": ["e2e-manifest.mjs"],
  "test-setup-github-scenarios.mjs": ["github-config.mjs"],
  "test-doctor-scenarios.mjs": ["doctor-local.mjs"],
  "emit-telemetry-artifact.mjs": ["telemetry-artifact.mjs", "ccsd-contract.mjs", "diff-size.mjs"],
  "validate-telemetry.mjs": ["telemetry-artifact.mjs"],
  "test-telemetry-artifact-scenarios.mjs": ["telemetry-artifact.mjs"],
};
