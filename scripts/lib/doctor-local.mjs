import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStack } from "./stacks.mjs";
import { CODEOWNERS_PLACEHOLDER } from "./setup-wizard.mjs";

export function result(status, label, detail, fix = "") {
  return { status, label, detail, fix };
}

/** @param {string} repoRoot */
export function listProductCiWorkflows(repoRoot) {
  const workflowsDir = join(repoRoot, ".github/workflows");
  if (!existsSync(workflowsDir)) return [];
  return readdirSync(workflowsDir).filter((name) => /^product-ci-([^.]+)\.yml$/.test(name));
}

/** @param {string} repoRoot */
export function inferStackFromProductCi(repoRoot) {
  const workflows = listProductCiWorkflows(repoRoot);
  if (workflows.length !== 1) return "";
  const match = workflows[0].match(/^product-ci-([^.]+)\.yml$/);
  return match?.[1] ?? "";
}

/** @param {string} repoRoot */
export function resolveStackId(repoRoot) {
  const stackFile = join(repoRoot, ".harness-stack");
  if (existsSync(stackFile)) {
    const stackId = readFileSync(stackFile, "utf8").trim();
    try {
      getStack(stackId);
      return stackId;
    } catch {
      return "";
    }
  }

  const inferred = inferStackFromProductCi(repoRoot);
  if (!inferred) return "";
  try {
    getStack(inferred);
    return inferred;
  } catch {
    return "";
  }
}

export function localChecks(repoRoot, { nodeVersion = process.versions.node, templateMode = false } = {}) {
  const entries = [];
  let stackId = "";
  const stackFile = join(repoRoot, ".harness-stack");

  if (!existsSync(stackFile)) {
    const inferred = inferStackFromProductCi(repoRoot);
    if (inferred) {
      try {
        getStack(inferred);
        stackId = inferred;
        entries.push(
          result(
            "PASS",
            ".harness-stack",
            `inferred ${inferred} from product-ci-${inferred}.yml (local file is gitignored; optional: run setup-wizard to write it)`,
          ),
        );
      } catch {
        entries.push(
          result(
            "FAIL",
            ".harness-stack",
            `missing and product-ci-${inferred}.yml maps to unknown stack`,
            "Run `./scripts/setup-wizard.mjs` or `./scripts/bootstrap-harness.sh`.",
          ),
        );
      }
    } else {
      entries.push(
        result(
          "FAIL",
          ".harness-stack",
          "missing",
          "Run `./scripts/setup-wizard.mjs` or `./scripts/bootstrap-harness.sh`.",
        ),
      );
    }
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
  } else if (templateMode && productWorkflows.length > 1) {
    entries.push(
      result(
        "PASS",
        "product-ci workflow",
        `template repo: ${productWorkflows.length} workflows (${productWorkflows.join(", ")})`,
      ),
    );
  } else {
    entries.push(
      result(
        "FAIL",
        "product-ci workflow",
        `expected exactly 1 product-ci workflow, found ${productWorkflows.length}`,
        "Re-run `./scripts/bootstrap-harness.sh` or `./scripts/setup-wizard.mjs --template`.",
      ),
    );
  }

  const codeownersFile = join(repoRoot, ".github/CODEOWNERS");
  if (!existsSync(codeownersFile)) {
    entries.push(result("FAIL", "CODEOWNERS", "missing", "Re-run `./scripts/bootstrap-harness.sh`."));
  } else {
    const hasPlaceholder = readFileSync(codeownersFile, "utf8").includes(CODEOWNERS_PLACEHOLDER);
    if (templateMode) {
      if (hasPlaceholder) {
        entries.push(result("PASS", "CODEOWNERS", "template placeholder preserved"));
      } else {
        entries.push(
          result(
            "FAIL",
            "CODEOWNERS",
            "template repo must keep placeholder owners",
            `Restore ${CODEOWNERS_PLACEHOLDER} in .github/CODEOWNERS (do not commit personal or org-specific owners here).`,
          ),
        );
      }
    } else if (hasPlaceholder) {
      entries.push(
        result(
          "FAIL",
          "CODEOWNERS",
          "placeholder team still present",
          "Run `./scripts/setup-wizard.mjs` or `./scripts/bootstrap-harness.sh --codeowners-team @org/team`.",
        ),
      );
    } else {
      entries.push(result("PASS", "CODEOWNERS", "team placeholder replaced"));
    }
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

  if (!stackId) {
    stackId = resolveStackId(repoRoot);
  }

  return { entries, stackId };
}
