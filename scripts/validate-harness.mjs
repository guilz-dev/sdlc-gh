#!/usr/bin/env node
/**
 * Validate harness assets: hooks.json, agent frontmatter, instructions presence.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadStacks } from "./lib/stacks.mjs";
import { patchHarnessCi, stacksForHarness } from "./lib/harness-ci-fragments.mjs";
import {
  BOOTSTRAP_LIB_FILES,
  BOOTSTRAP_SCRIPT_MJS,
  SCRIPT_LIB_IMPORTS,
} from "./lib/bootstrap-copy.mjs";

const ROOT = process.cwd();
let errors = 0;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) fm[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return fm;
}

// hooks.json
const hooksPath = join(ROOT, ".github/hooks/hooks.json");
if (existsSync(hooksPath)) {
  try {
    const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
    if (!Array.isArray(hooks.hooks) && !hooks.hooks) {
      fail("hooks.json: expected hooks array or object with hooks key");
    }
  } catch (e) {
    fail(`hooks.json: invalid JSON — ${e.message}`);
  }
} else {
  warn("hooks.json not found (optional until Phase 1)");
}

// agents
const agentsDir = join(ROOT, ".github/agents");
if (existsSync(agentsDir)) {
  for (const f of readdirSync(agentsDir).filter((x) => x.endsWith(".agent.md"))) {
    const content = readFileSync(join(agentsDir, f), "utf8");
    const fm = parseFrontmatter(content);
    if (!fm) fail(`${f}: missing YAML frontmatter`);
    else {
      if (!fm.name) fail(`${f}: frontmatter missing 'name'`);
      if (!fm.description) fail(`${f}: frontmatter missing 'description'`);
    }
  }
}

// instructions
const instrDir = join(ROOT, ".github/instructions");
if (existsSync(instrDir)) {
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".instructions.md")) {
        const fm = parseFrontmatter(readFileSync(p, "utf8"));
        if (!fm?.description) fail(`${relative(ROOT, p)}: missing description in frontmatter`);
      }
    }
  };
  walk(instrDir);
}

// labels.yml
if (existsSync(join(ROOT, ".github/labels.yml"))) {
  const labels = readFileSync(join(ROOT, ".github/labels.yml"), "utf8");
  if (!labels.includes("task:")) warn("labels.yml: no task:* labels found");
}

// stack catalog consistency
const catalogPath = join(ROOT, "config/stacks.json");
const harnessCiPath = join(ROOT, ".github/workflows/harness-ci.yml");
if (existsSync(catalogPath) && existsSync(harnessCiPath)) {
  const harnessCi = readFileSync(harnessCiPath, "utf8");
  try {
    const expected = patchHarnessCi(harnessCi, stacksForHarness());
    if (harnessCi !== expected) {
      fail("harness-ci.yml: detect/product jobs are out of sync with config/stacks.json");
    }
  } catch (e) {
    fail(`harness-ci.yml: ${e.message}`);
  }

  for (const stack of loadStacks()) {
    const profilePath = join(ROOT, ".github/instructions/profiles", stack.profile);
    const workflowPath = join(ROOT, ".github/workflows", stack.workflow);
    const sampleMarkerPath = join(ROOT, stack.sampleMarker);

    if (!existsSync(profilePath)) {
      fail(`missing profile for stack ${stack.id}: ${stack.profile}`);
    }
    if (!existsSync(workflowPath)) {
      fail(`missing workflow for stack ${stack.id}: ${stack.workflow}`);
    }
    if (!existsSync(sampleMarkerPath)) {
      fail(`missing sample marker for stack ${stack.id}: ${stack.sampleMarker}`);
    }

    const workflow = readFileSync(workflowPath, "utf8");
    const sampleDir = `sample/${stack.sampleDir}`;
    if (!workflow.includes(sampleDir) || !workflow.includes(stack.marker)) {
      fail(`${stack.workflow}: missing sample/root resolution for ${stack.id}`);
    }
  }
} else {
  warn("config/stacks.json or harness-ci.yml not found — skipping stack catalog checks");
}

// script -> lib import resolution (bootstrap copy drift guard)
for (const [script, libs] of Object.entries(SCRIPT_LIB_IMPORTS)) {
  const scriptPath = join(ROOT, "scripts", script);
  if (!existsSync(scriptPath)) {
    fail(`missing script entrypoint: scripts/${script}`);
    continue;
  }
  for (const lib of libs) {
    if (!existsSync(join(ROOT, "scripts/lib", lib))) {
      fail(`scripts/${script} requires scripts/lib/${lib} but file is missing`);
    }
  }
}

for (const lib of BOOTSTRAP_LIB_FILES) {
  if (!existsSync(join(ROOT, "scripts/lib", lib))) {
    fail(`bootstrap lib manifest missing in template: scripts/lib/${lib}`);
  }
}

for (const script of BOOTSTRAP_SCRIPT_MJS) {
  if (!existsSync(join(ROOT, "scripts", script))) {
    fail(`bootstrap script manifest missing in template: scripts/${script}`);
  }
}

const bootstrapSh = readFileSync(join(ROOT, "scripts/bootstrap-harness.sh"), "utf8");
for (const lib of BOOTSTRAP_LIB_FILES) {
  if (!bootstrapSh.includes(lib)) {
    fail(`bootstrap-harness.sh does not copy scripts/lib/${lib}`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} validation error(s)`);
  process.exit(1);
}
console.log("Harness validation passed");
