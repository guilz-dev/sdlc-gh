#!/usr/bin/env node
/**
 * Trim harness-ci.yml to selected stack(s) for bootstrapped repositories.
 * Usage: node scripts/trim-harness-ci.mjs <stack-id> <harness-ci.yml path>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { patchHarnessCi, stacksForHarness } from "./lib/harness-ci-fragments.mjs";

const [stackId, targetPath] = process.argv.slice(2);
if (!stackId || !targetPath) {
  console.error("Usage: node scripts/trim-harness-ci.mjs <stack-id> <harness-ci.yml>");
  process.exit(1);
}

const stacks = stacksForHarness(stackId);
const content = readFileSync(targetPath, "utf8");
writeFileSync(targetPath, patchHarnessCi(content, stacks));
console.log(`Trimmed ${targetPath} to stack=${stackId}`);
