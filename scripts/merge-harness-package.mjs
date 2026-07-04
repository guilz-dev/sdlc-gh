#!/usr/bin/env node
import { resolve } from "node:path";
import { mergeHarnessPackageJson } from "./lib/merge-harness-package.mjs";

const [templatePathArg, targetPathArg] = process.argv.slice(2);
if (!templatePathArg || !targetPathArg || process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: merge-harness-package.mjs <template-package.json> <target-package.json>`);
  process.exit(templatePathArg && !targetPathArg ? 1 : 0);
}

const templatePath = resolve(templatePathArg);
const targetPath = resolve(targetPathArg);
const result = mergeHarnessPackageJson(templatePath, targetPath);
console.log(`${result.action} ${targetPath} (${result.scriptCount} harness scripts)`);
