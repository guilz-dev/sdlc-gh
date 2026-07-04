import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStack } from "./stacks.mjs";

export function result(status, label, detail, fix = "") {
  return { status, label, detail, fix };
}

export function localChecks(repoRoot, { nodeVersion = process.versions.node } = {}) {
  const entries = [];
  const stackFile = join(repoRoot, ".harness-stack");
  let stackId = "";

  if (!existsSync(stackFile)) {
    entries.push(result("FAIL", ".harness-stack", "missing", "Run `./scripts/bootstrap-harness.sh` again."));
  } else {
    stackId = readFileSync(stackFile, "utf8").trim();
    try {
      getStack(stackId);
      entries.push(result("PASS", ".harness-stack", `stack is ${stackId}`));
    } catch {
      entries.push(
        result(
          "FAIL",
          ".harness-stack",
          `unknown stack value: ${stackId}`,
          "Set .harness-stack to a supported stack id.",
        ),
      );
    }
  }

  const workflowsDir = join(repoRoot, ".github/workflows");
  const productWorkflows = existsSync(workflowsDir)
    ? readdirSync(workflowsDir).filter((name) => /^product-ci-.*\.yml$/.test(name))
    : [];
  if (productWorkflows.length === 1) {
    entries.push(result("PASS", "product-ci workflow", `found ${productWorkflows[0]}`));
  } else {
    entries.push(
      result(
        "FAIL",
        "product-ci workflow",
        `expected exactly 1 product-ci workflow, found ${productWorkflows.length}`,
        "Re-run `./scripts/bootstrap-harness.sh` and confirm the selected stack.",
      ),
    );
  }

  const codeownersFile = join(repoRoot, ".github/CODEOWNERS");
  if (!existsSync(codeownersFile)) {
    entries.push(result("FAIL", "CODEOWNERS", "missing", "Re-run `./scripts/bootstrap-harness.sh`."));
  } else if (readFileSync(codeownersFile, "utf8").includes("@your-org/harness-engineers")) {
    entries.push(
      result(
        "FAIL",
        "CODEOWNERS",
        "placeholder team still present",
        "Re-run `./scripts/bootstrap-harness.sh --codeowners-team @org/team`.",
      ),
    );
  } else {
    entries.push(result("PASS", "CODEOWNERS", "team placeholder replaced"));
  }

  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  if (nodeMajor >= 22) {
    entries.push(result("PASS", "Node.js", `version ${nodeVersion}`));
  } else {
    entries.push(
      result(
        "FAIL",
        "Node.js",
        `version ${nodeVersion} is below 22`,
        "Install Node.js 22+ for local parity with CI.",
      ),
    );
  }

  return { entries, stackId };
}
