#!/usr/bin/env node
/**
 * Reject/allow scenario tests for hooks.json patterns (Phase 2 static gate).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const hooksPath = join(process.cwd(), ".github/hooks/hooks.json");
if (!existsSync(hooksPath)) {
  console.error("hooks.json not found");
  process.exit(1);
}

const { hooks } = JSON.parse(readFileSync(hooksPath, "utf8"));
const blockPatterns = hooks
  .filter((h) => h.action === "block" && h.pattern)
  .map((h) => new RegExp(h.pattern, "i"));

const mustBlock = [
  "git push --force",
  "git push -f origin main",
  "rm -rf /",
  "DROP TABLE users",
];

const mustAllow = ["git status", "npm test", "pytest -q"];

for (const cmd of mustBlock) {
  const blocked = blockPatterns.some((re) => re.test(cmd));
  if (!blocked) {
    console.error(`::error::Expected block for: ${cmd}`);
    process.exit(1);
  }
}

for (const cmd of mustAllow) {
  const blocked = blockPatterns.some((re) => re.test(cmd));
  if (blocked) {
    console.error(`::error::Unexpected block for: ${cmd}`);
    process.exit(1);
  }
}

console.log("Hooks scenario tests passed");
