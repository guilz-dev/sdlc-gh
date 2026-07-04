#!/usr/bin/env node
/**
 * Phase 4: if eval pass rate exceeds production acceptance by DRIFT_PT, flag drift.
 * Reads evals/.score-baseline.json (optional) or uses defaults for template CI.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DRIFT_PT = Number(process.env.HARNESS_EVAL_DRIFT_PT || 15);
const baselinePath = join(process.cwd(), "evals/.score-baseline.json");

let evalPass = 85;
let prodAccept = 70;

if (existsSync(baselinePath)) {
  const b = JSON.parse(readFileSync(baselinePath, "utf8"));
  evalPass = Number(b.eval_pass_rate ?? evalPass);
  prodAccept = Number(b.production_acceptance_rate ?? prodAccept);
}

const gap = evalPass - prodAccept;
console.log(`Eval pass ${evalPass}% vs production acceptance ${prodAccept}% (gap ${gap}pt, threshold ${DRIFT_PT}pt)`);

if (gap > DRIFT_PT) {
  console.warn(
    `::warning::Eval/production gap ${gap}pt exceeds ${DRIFT_PT}pt — open bench review issue`,
  );
  process.exit(2);
}

console.log("Eval score drift check passed");
