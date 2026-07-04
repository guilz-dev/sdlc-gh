#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execFileSync } from "node:child_process";
import {
  applyCodeownersOwner,
  buildWizardPlan,
  codeownersHasPlaceholder,
  detectRepoProfile,
  detectStackCandidates,
  getStack,
  ghReady,
  isValidCodeownersOwner,
  readHarnessStack,
  resolveGithubRepo,
  runBootstrap,
  runDoctor,
  runSetupGithub,
  stackIds,
  suggestStack,
  writeHarnessStack,
} from "./lib/setup-wizard.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveRepoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function parseArgs(argv) {
  const args = {
    repoRoot: "",
    stack: "",
    codeowners: "",
    githubRepo: "",
    mode: "",
    yes: false,
    skipGithub: false,
    withEvalRuleset: false,
    template: false,
    dryRun: false,
    bootstrap: false,
    forceBootstrap: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--repo") {
      args.repoRoot = argv[++i] ?? "";
    } else if (value === "--stack") {
      args.stack = argv[++i] ?? "";
    } else if (value === "--codeowners" || value === "--codeowners-team") {
      args.codeowners = argv[++i] ?? "";
    } else if (value === "--github-repo") {
      args.githubRepo = argv[++i] ?? "";
    } else if (value === "--mode") {
      args.mode = argv[++i] ?? "";
    } else if (value === "--yes") {
      args.yes = true;
    } else if (value === "--skip-github") {
      args.skipGithub = true;
    } else if (value === "--with-eval-ruleset") {
      args.withEvalRuleset = true;
    } else if (value === "--template") {
      args.template = true;
    } else if (value === "--dry-run") {
      args.dryRun = true;
    } else if (value === "--bootstrap") {
      args.bootstrap = true;
    } else if (value === "--force-bootstrap") {
      args.forceBootstrap = true;
      args.bootstrap = true;
    } else if (value === "--help" || value === "-h") {
      printUsage();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function printUsage() {
  console.log(`Usage: setup-wizard.mjs [options]

Interactive setup for Phase 0–1: .harness-stack, CODEOWNERS, GitHub labels/rulesets, doctor.

Options:
  --repo <path>              Repository root (default: git root)
  --stack <id>               Primary stack (${stackIds().join("|")})
  --codeowners @org/team     CODEOWNERS owner (team or @username)
  --github-repo owner/name   GitHub repository for setup-github
  --mode new|existing        Bootstrap mode when harness is missing
  --template                 Template repo mode (multiple product-ci workflows)
  --with-eval-ruleset        Also apply harness-pr-eval-required ruleset
  --skip-github              Local files only; skip setup-github
  --bootstrap                Force bootstrap when harness is missing
  --force-bootstrap          Re-run bootstrap on an existing harness (overwrites assets)
  --dry-run                  Print plan; skip mutating GitHub and doctor
  --yes                      Non-interactive (requires stack + codeowners when configuring)

Examples:
  ./scripts/setup-wizard.mjs
  ./scripts/setup-wizard.mjs --yes --stack ts --codeowners @acme/platform
  ./scripts/setup-wizard.mjs --template --yes --stack ts --codeowners @acme/platform
`);
}

async function ask(rl, question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function confirm(rl, summary, yes) {
  if (yes) return true;
  if (summary) console.log(summary);
  const answer = (await rl.question("Proceed? [y/N]: ")).trim();
  return /^(y|yes)$/i.test(answer);
}

async function resolveStack(rl, repoRoot, stackArg, yes) {
  if (stackArg) {
    getStack(stackArg);
    return stackArg;
  }

  const existing = readHarnessStack(repoRoot);
  if (existing) {
    getStack(existing);
    console.log(`Existing .harness-stack: ${existing}`);
    if (yes) return existing;
    const keep = await ask(rl, "Keep this stack? (y/n)", "y");
    if (/^(y|yes)$/i.test(keep)) return existing;
  }

  const suggested = suggestStack(repoRoot);
  if (suggested && !detectStackCandidates(repoRoot).ambiguous) {
    console.log(`Detected stack: ${suggested}`);
    if (yes) return suggested;
    const answer = await ask(rl, "Use this stack? (y/n)", "y");
    if (/^(y|yes)$/i.test(answer)) return suggested;
  }

  if (yes) fail("--stack is required with --yes when stack cannot be inferred.");

  const detected = detectStackCandidates(repoRoot);
  if (detected.rootMatches.length || detected.nestedMatches.length) {
    for (const match of detected.rootMatches) {
      console.log(`  root: ${match.stackId} (${match.path})`);
    }
    for (const match of detected.nestedMatches) {
      console.log(`  nested: ${match.stackId} (${match.path})`);
    }
  }

  const stack = await ask(rl, `Choose stack (${stackIds().join(", ")})`, suggested || "ts");
  getStack(stack);
  return stack;
}

async function resolveCodeowners(rl, codeownersArg, yes, required) {
  if (codeownersArg) {
    if (!isValidCodeownersOwner(codeownersArg)) fail(`Invalid CODEOWNERS owner: ${codeownersArg}`);
    return codeownersArg.trim();
  }
  if (!required) return "";
  if (yes) fail("--codeowners is required with --yes.");
  const owner = await ask(rl, "CODEOWNERS owner (@org/team or @username)");
  if (!isValidCodeownersOwner(owner)) fail(`Invalid CODEOWNERS owner: ${owner}`);
  return owner.trim();
}

async function resolveBootstrapMode(rl, repoRoot, modeArg, yes) {
  if (modeArg === "new" || modeArg === "existing") return modeArg;
  if (yes) fail("--mode is required with --yes when bootstrapping.");

  const answer = await ask(rl, "Bootstrap mode (new=copy sample to root, existing=keep product code)", "existing");
  if (answer !== "new" && answer !== "existing") fail(`Unknown mode: ${answer}`);
  return answer;
}

function printPlanHeader(plan) {
  console.log("\nSetup wizard plan");
  console.log(`  repo: ${plan.repoRoot}`);
  console.log(`  profile: ${plan.template ? "template" : "product"}`);
  console.log(`  stack: ${plan.stackId}`);
  if (plan.owner) console.log(`  CODEOWNERS: ${plan.owner}`);
  if (!plan.skipGithub) console.log(`  github: ${plan.githubRepo || "(auto-detect)"}`);
  if (plan.withEvalRuleset) console.log("  eval ruleset: yes");
  console.log("  steps:");
  for (const step of plan.steps) {
    console.log(`    - ${step.id}: ${step.detail}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.repoRoot || resolveRepoRoot();
  const profile = detectRepoProfile(repoRoot, { template: args.template });
  const template = profile.template || args.template;
  const wantsBootstrap = args.bootstrap || args.forceBootstrap;
  const needsBootstrap = !profile.harnessPresent || wantsBootstrap;

  if (profile.harnessPresent && wantsBootstrap && !args.forceBootstrap) {
    fail(
      "Harness assets already present. Omit --bootstrap or pass --force-bootstrap to overwrite (destructive).",
    );
  }

  if (profile.harnessPresent && args.forceBootstrap && args.yes) {
    fail("--force-bootstrap requires interactive confirmation; omit --yes.");
  }

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 22) {
    fail(`Node.js 22+ required (current: ${process.versions.node}).`);
  }

  const rl = readline.createInterface({ input, output });

  try {
    console.log("SDLC-GH setup wizard (Phase 0–1)\n");
    console.log(`Repository: ${repoRoot}`);
    console.log(`Profile: ${profile.kind}${template ? " (template mode)" : ""}`);

    let stackId = args.stack;
    let owner = args.codeowners;
    let ranBootstrap = false;

    if (needsBootstrap) {
      if (args.forceBootstrap) {
        console.log("\nWARNING: --force-bootstrap will overwrite harness assets in this repository.");
      } else {
        console.log("\nHarness assets not detected — bootstrap required.");
      }
      stackId = await resolveStack(rl, repoRoot, stackId, args.yes);
      const mode = await resolveBootstrapMode(rl, repoRoot, args.mode, args.yes);
      owner = await resolveCodeowners(rl, owner, args.yes, true);

      const bootstrapSummary = [
        "Bootstrap summary",
        `  repo: ${repoRoot}`,
        `  stack: ${stackId}`,
        `  mode: ${mode}`,
        `  CODEOWNERS: ${owner}`,
      ].join("\n");

      if (!(await confirm(rl, bootstrapSummary, args.yes))) {
        console.log("Cancelled.");
        process.exit(1);
      }

      if (args.dryRun) {
        console.log("[dry-run] bootstrap-harness.sh would run");
      } else {
        const bootstrapResult = runBootstrap({
          repoRoot,
          stackId,
          mode,
          owner,
          yes: true,
        });
        if (bootstrapResult.status !== 0) {
          console.error(bootstrapResult.stderr || bootstrapResult.stdout);
          fail("Bootstrap failed.");
        }
        if (bootstrapResult.stdout) console.log(bootstrapResult.stdout);
        ranBootstrap = true;
      }
    } else {
      stackId = await resolveStack(rl, repoRoot, stackId, args.yes);
      const needsOwner = codeownersHasPlaceholder(repoRoot);
      if (needsOwner) {
        owner = await resolveCodeowners(rl, owner, args.yes, true);
      } else if (owner) {
        if (!isValidCodeownersOwner(owner)) fail(`Invalid CODEOWNERS owner: ${owner}`);
        owner = owner.trim();
      } else {
        console.log("CODEOWNERS: placeholder already replaced.");
      }
    }

    const githubRepo = args.githubRepo || resolveGithubRepo(repoRoot);
    if (!args.skipGithub && !args.dryRun) {
      const gh = ghReady(repoRoot);
      if (!gh.ok) fail(`${gh.reason}. Use --skip-github to configure local files only.`);
    }

    const willPatchCodeowners = Boolean(owner) && codeownersHasPlaceholder(repoRoot);
    const ownerLabel = owner || "(unchanged)";

    const plan = buildWizardPlan({
      repoRoot,
      stackId,
      owner: ownerLabel,
      githubRepo,
      template,
      withEvalRuleset: args.withEvalRuleset,
      yes: args.yes,
      skipGithub: args.skipGithub,
      dryRun: args.dryRun,
      writeHarnessStack: !ranBootstrap,
      patchCodeowners: !ranBootstrap && willPatchCodeowners,
    });

    if (owner && !willPatchCodeowners && !ranBootstrap) {
      console.log(
        "::notice::CODEOWNERS placeholder already replaced; --codeowners ignored (edit .github/CODEOWNERS manually).",
      );
    }

    if (ranBootstrap) {
      plan.steps = plan.steps.filter((step) => step.id !== "harness-stack" && step.id !== "codeowners");
    }

    printPlanHeader({ ...plan, repoRoot, stackId, owner });

    if (!(await confirm(rl, "", args.yes))) {
      console.log("Cancelled.");
      process.exit(1);
    }

    if (args.dryRun) {
      console.log("\nDry run complete.");
      process.exit(0);
    }

    if (!ranBootstrap) {
      writeHarnessStack(repoRoot, stackId);
      if (willPatchCodeowners) {
        applyCodeownersOwner(repoRoot, owner);
      }
    }

    if (!args.skipGithub) {
      const setupResult = runSetupGithub({
        repoRoot,
        githubRepo,
        withEvalRuleset: args.withEvalRuleset,
        yes: true,
        dryRun: false,
      });
      if (setupResult.status !== 0) {
        console.error(setupResult.stderr || setupResult.stdout);
        fail("setup-github failed.");
      }
      console.log(setupResult.stdout || "GitHub setup complete.");
    }

    const doctorResult = runDoctor({ repoRoot, template, strict: true });
    if (doctorResult.stdout) console.log(doctorResult.stdout);
    if (doctorResult.stderr) console.error(doctorResult.stderr);

    if (doctorResult.status !== 0) {
      fail("doctor --strict reported failures. Fix the items above and re-run.");
    }

    console.log("\nSetup wizard complete.");
    console.log("Next: commit local changes (e.g. CODEOWNERS), then open a test PR to verify required checks.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  fail(error.message);
});
