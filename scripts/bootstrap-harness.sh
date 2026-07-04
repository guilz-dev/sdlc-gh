#!/usr/bin/env bash
set -euo pipefail

REPO=""
STACK=""
MODE=""
CODEOWNERS_TEAM=""
YES=0
TEMPLATE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

stack_field() {
  node --input-type=module -e "
    import { getStack } from 'file://${TEMPLATE_ROOT}/scripts/lib/stacks.mjs';
    const s = getStack(process.argv[1]);
    console.log(s[process.argv[2]]);
  " "$STACK" "$1"
}

stack_ids() {
  node --input-type=module -e "
    import { stackIds } from 'file://${TEMPLATE_ROOT}/scripts/lib/stacks.mjs';
    console.log(stackIds().join(' '));
  "
}

usage() {
  local ids
  ids="$(stack_ids | tr ' ' '|')"
  cat <<EOF
Usage: $0 [--repo <path>] [--stack <${ids}>] [--mode new|existing] [--codeowners-team @org/team] [--yes]
EOF
  exit 1
}

validate_stack() {
  node --input-type=module -e "
    import { getStack } from 'file://${TEMPLATE_ROOT}/scripts/lib/stacks.mjs';
    getStack(process.argv[1]);
  " "$1" >/dev/null 2>&1
}

detect_repo() {
  if [[ -n "$REPO" ]]; then
    return
  fi

  local git_root=""
  git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$git_root" ]] && [[ "$(cd "$git_root" && pwd)" != "$TEMPLATE_ROOT" ]]; then
    REPO="$git_root"
  else
    REPO="$PWD"
  fi
}

detect_stack_json() {
  node --input-type=module -e "
    import { detectStackCandidates } from 'file://${TEMPLATE_ROOT}/scripts/lib/stacks.mjs';
    console.log(JSON.stringify(detectStackCandidates(process.argv[1])));
  " "$REPO"
}

stack_suggested() {
  node --input-type=module -e "
    const input = JSON.parse(process.argv[1]);
    console.log(input.suggested ?? '');
  " "$1"
}

stack_candidates() {
  node --input-type=module -e "
    const input = JSON.parse(process.argv[1]);
    const ids = [...new Set([...input.rootMatches, ...input.nestedMatches].map((m) => m.stackId))];
    console.log(ids.join(' '));
  " "$1"
}

stack_summary() {
  node --input-type=module -e "
    const input = JSON.parse(process.argv[1]);
    for (const match of input.rootMatches) console.log(\`root:\${match.stackId}:\${match.path}\`);
    for (const match of input.nestedMatches) console.log(\`nested:\${match.stackId}:\${match.path}\`);
  " "$1"
}

prompt_stack() {
  local detected_json suggested candidates answer
  detected_json="$(detect_stack_json)"
  suggested="$(stack_suggested "$detected_json")"
  candidates="$(stack_candidates "$detected_json")"

  if [[ -n "$suggested" ]]; then
    STACK="$suggested"
    echo "Detected stack: $STACK"
    return
  fi

  if [[ -n "$candidates" ]]; then
    echo "Detected stack candidates:"
    stack_summary "$detected_json"
    if [[ "$YES" -eq 1 ]]; then
      echo "Unable to infer a single stack. Re-run with --stack." >&2
      exit 1
    fi
    read -r -p "Choose stack [${candidates// /, }]: " answer
  else
    if [[ "$YES" -eq 1 ]]; then
      echo "Unable to detect a stack. Re-run with --stack." >&2
      exit 1
    fi
    read -r -p "Stack not detected. Choose stack [$(stack_ids | tr ' ' ', ')]: " answer
  fi

  if ! validate_stack "$answer"; then
    echo "Unknown stack: $answer" >&2
    exit 1
  fi
  STACK="$answer"
}

detect_mode_json() {
  node --input-type=module -e "
    import { inspectRepoMode } from 'file://${TEMPLATE_ROOT}/scripts/lib/stacks.mjs';
    console.log(JSON.stringify(inspectRepoMode(process.argv[1])));
  " "$REPO"
}

mode_field() {
  node --input-type=module -e "
    const input = JSON.parse(process.argv[1]);
    console.log(input[process.argv[2]] ?? '');
  " "$1" "$2"
}

prompt_mode() {
  local detected_json suggested ambiguous reason answer
  detected_json="$(detect_mode_json)"
  suggested="$(mode_field "$detected_json" suggested)"
  ambiguous="$(mode_field "$detected_json" ambiguous)"
  reason="$(mode_field "$detected_json" reason)"

  if [[ -n "$suggested" ]] && [[ "$ambiguous" != "true" ]]; then
    MODE="$suggested"
    echo "Detected mode: $MODE ($reason)"
    return
  fi

  if [[ "$YES" -eq 1 ]]; then
    echo "Unable to infer mode safely ($reason). Re-run with --mode." >&2
    exit 1
  fi

  echo "Mode requires confirmation: $reason"
  read -r -p "Choose mode [new/existing]: " answer
  case "$answer" in
    new|existing) MODE="$answer" ;;
    *) echo "Unknown mode: $answer" >&2; exit 1 ;;
  esac
}

prompt_codeowners_team() {
  local answer
  if [[ -n "$CODEOWNERS_TEAM" ]]; then
    return
  fi

  if [[ "$YES" -eq 1 ]]; then
    echo "--codeowners-team is required with --yes." >&2
    exit 1
  fi

  read -r -p "CODEOWNERS team [@org/team or @username]: " answer
  if [[ ! "$answer" =~ ^@[^/]+/[^/]+$ ]] && [[ ! "$answer" =~ ^@[A-Za-z0-9_.-]+$ ]]; then
    echo "Expected @org/team or @username format." >&2
    exit 1
  fi
  CODEOWNERS_TEAM="$answer"
}

confirm_summary() {
  [[ "$YES" -eq 1 ]] && return

  local profile product_ci sample_dir
  profile="$(stack_field profile)"
  product_ci="$(stack_field workflow)"
  sample_dir="$(stack_field sampleDir)"

  cat <<EOF
Bootstrap summary
  repo: $REPO
  stack: $STACK
  mode: $MODE
  CODEOWNERS team: $CODEOWNERS_TEAM
  profile: $profile
  workflow: $product_ci
  sample copy: $([[ "$MODE" == "new" ]] && echo "sample/$sample_dir -> repo root" || echo "disabled")
EOF
  read -r -p "Proceed? [y/N]: " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Cancelled."; exit 1 ;;
  esac
}

resolve_github_repo_name() {
  if ! command -v gh >/dev/null 2>&1; then
    return 1
  fi
  gh repo view --json nameWithOwner 2>/dev/null \
    | node --input-type=module -e "
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const text = chunks.join('').trim();
      if (!text) process.exit(1);
      const parsed = JSON.parse(text);
      if (!parsed.nameWithOwner) process.exit(1);
      console.log(parsed.nameWithOwner);
    " 2>/dev/null
}

print_next_step() {
  local setup_cmd
  if [[ -d "$REPO/.git" ]] || git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if (cd "$REPO" && resolve_github_repo_name >/dev/null); then
      setup_cmd="./scripts/setup-wizard.mjs --yes --stack $STACK --codeowners $CODEOWNERS_TEAM"
    else
      setup_cmd="./scripts/setup-wizard.mjs --yes --stack $STACK --codeowners $CODEOWNERS_TEAM --github-repo OWNER/REPO"
    fi
  else
    setup_cmd="./scripts/setup-wizard.mjs --yes --stack $STACK --codeowners $CODEOWNERS_TEAM --github-repo OWNER/REPO"
  fi

  echo "Next: $setup_cmd"
  echo "      Or: ./scripts/setup-github.sh --yes (after reviewing CODEOWNERS and .harness-stack)"
  echo "      Replace OWNER/REPO with your GitHub repository if auto-detection is unavailable."
}

replace_codeowners_placeholder() {
  node --input-type=module -e "
    import { readFileSync, writeFileSync } from 'node:fs';
    const path = process.argv[1];
    const team = process.argv[2];
    const current = readFileSync(path, 'utf8');
    writeFileSync(path, current.replaceAll('@your-org/harness-engineers', team));
  " "$1" "$CODEOWNERS_TEAM"
}

copy_tree() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if command -v rsync &>/dev/null; then
    rsync -a \
      --exclude 'node_modules' \
      --exclude '__pycache__' \
      --exclude '.pytest_cache' \
      --exclude '.vite' \
      --exclude 'vendor' \
      --exclude '.bundle' \
      "$src/" "$dst/"
  else
    local item base
    shopt -s dotglob nullglob
    for item in "$src"/*; do
      base="$(basename "$item")"
      case "$base" in
        node_modules|__pycache__|.pytest_cache|.vite|vendor|.bundle) continue ;;
      esac
      cp -R "$item" "$dst/"
    done
    shopt -u dotglob nullglob
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --stack) STACK="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --codeowners-team) CODEOWNERS_TEAM="$2"; shift 2 ;;
    --yes) YES=1; shift ;;
    *) usage ;;
  esac
done

detect_repo

if [[ -n "$STACK" ]] && ! validate_stack "$STACK"; then
  echo "Unknown stack: $STACK" >&2
  usage
fi

[[ -n "$STACK" ]] || prompt_stack

case "$MODE" in
  "" ) prompt_mode ;;
  new|existing) ;;
  * ) echo "Unknown mode: $MODE" >&2; usage ;;
esac

prompt_codeowners_team
confirm_summary

[[ ! -d "$REPO" ]] && mkdir -p "$REPO"

PROFILE="$(stack_field profile)"
PRODUCT_CI="$(stack_field workflow)"
SAMPLE_DIR="$(stack_field sampleDir)"

echo "Bootstrapping harness into $REPO (stack=$STACK, mode=$MODE)"

# Core docs
mkdir -p "$REPO/docs" "$REPO/docs/exceptions"
for f in operations.md adoption.md auth-boundaries.md failure-taxonomy.md telemetry-schema.md telemetry-artifacts.md nightly-harness-review.md gh-aw-dogfood.md \
  shared-config.md coding-agent-l1.md kpi-baseline.md revert-playbook.md; do
  cp "$TEMPLATE_ROOT/docs/$f" "$REPO/docs/" 2>/dev/null || true
done
cp "$TEMPLATE_ROOT/docs/exceptions/README.md" "$REPO/docs/exceptions/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/docs/exceptions/TEMPLATE.md" "$REPO/docs/exceptions/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/docs/arch.md" "$REPO/docs/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/AGENTS.md" "$REPO/"
cp "$TEMPLATE_ROOT/README.md" "$REPO/HARNESS_README.md" 2>/dev/null || true
mkdir -p "$REPO/config"
cp "$TEMPLATE_ROOT/config/stacks.json" "$REPO/config/"

# .github harness assets
mkdir -p "$REPO/.github"
copy_tree "$TEMPLATE_ROOT/.github/agents" "$REPO/.github/agents"
copy_tree "$TEMPLATE_ROOT/.github/hooks" "$REPO/.github/hooks"
copy_tree "$TEMPLATE_ROOT/.github/ISSUE_TEMPLATE" "$REPO/.github/ISSUE_TEMPLATE"
copy_tree "$TEMPLATE_ROOT/.github/skills" "$REPO/.github/skills"
cp "$TEMPLATE_ROOT/.github/copilot-instructions.md" "$REPO/.github/"
cp "$TEMPLATE_ROOT/.github/labels.yml" "$REPO/.github/"
cp "$TEMPLATE_ROOT/.github/pull_request_template.md" "$REPO/.github/"
cp "$TEMPLATE_ROOT/.github/CODEOWNERS" "$REPO/.github/"
replace_codeowners_placeholder "$REPO/.github/CODEOWNERS"
cp "$TEMPLATE_ROOT/.github/ruleset.example.json" "$REPO/.github/" 2>/dev/null || true

mkdir -p "$REPO/.github/instructions/profiles"
cp "$TEMPLATE_ROOT/.github/instructions/core.instructions.md" "$REPO/.github/instructions/"
cp "$TEMPLATE_ROOT/.github/instructions/profiles/$PROFILE" "$REPO/.github/instructions/profiles/"

# Workflows — core + selected stack product CI + phase 2–4
mkdir -p "$REPO/.github/workflows"
for wf in harness-ci.yml copilot-setup-steps.yml pr-context-comment.yml eval-ci.yml eval-drift.yml \
  agent-retry-orchestrator.yml harness-sync.yml labels-sync.yml nightly-harness-review.yml gh-aw-dogfood-ci.yml; do
  cp "$TEMPLATE_ROOT/.github/workflows/$wf" "$REPO/.github/workflows/"
done
cp "$TEMPLATE_ROOT/.github/workflows/$PRODUCT_CI" "$REPO/.github/workflows/"
node "$TEMPLATE_ROOT/scripts/trim-harness-ci.mjs" "$STACK" "$REPO/.github/workflows/harness-ci.yml"
for aw in nightly-harness-review.md weekly-redteam.md nightly-harness-review.lock.yml weekly-redteam.lock.yml; do
  cp "$TEMPLATE_ROOT/.github/workflows/$aw" "$REPO/.github/workflows/" 2>/dev/null || true
done
cp "$TEMPLATE_ROOT/.github/ruleset.harness-eval.example.json" "$REPO/.github/" 2>/dev/null || true

# Scripts
mkdir -p "$REPO/scripts/lib"
for s in validate-harness.mjs check-diff-size.mjs check-issue-spec.mjs select-eval-jobs.mjs \
  check-e2e-manifest.mjs validate-telemetry.mjs emit-telemetry-artifact.mjs fetch-telemetry-artifacts.mjs \
  aggregate-harness-review.mjs route-harness-review.mjs check-gh-aw-dogfood-scope.mjs validate-gh-aw-compile.mjs \
  emit-gh-aw-dogfood-report.mjs check-open-pr-limit.mjs test-hooks-scenarios.mjs test-issue-spec-scenarios.mjs \
  test-diff-size-scenarios.mjs test-e2e-manifest-scenarios.mjs test-setup-github-scenarios.mjs test-doctor-scenarios.mjs \
  test-telemetry-artifact-scenarios.mjs test-harness-review-scenarios.mjs test-harness-review-routing-scenarios.mjs test-gh-aw-dogfood-scenarios.mjs \
  test-bootstrap-guidance-scenarios.mjs test-setup-wizard-scenarios.mjs \
  harness-drift-report.mjs check-eval-score-drift.mjs run-e2e-bench.mjs doctor.mjs setup-github.mjs setup-wizard.mjs; do
  cp "$TEMPLATE_ROOT/scripts/$s" "$REPO/scripts/" 2>/dev/null || true
done
for s in bootstrap-harness.sh setup-github.sh verify-bootstrap-stacks.sh; do
  cp "$TEMPLATE_ROOT/scripts/$s" "$REPO/scripts/" 2>/dev/null || true
done
for s in stacks.mjs harness-ci-fragments.mjs ccsd-contract.mjs github-config.mjs diff-size.mjs e2e-manifest.mjs \
  doctor-local.mjs bootstrap-copy.mjs telemetry-artifact.mjs harness-review.mjs harness-review-routing.mjs gh-aw-dogfood.mjs setup-wizard.mjs; do
  cp "$TEMPLATE_ROOT/scripts/lib/$s" "$REPO/scripts/lib/" 2>/dev/null || true
done
cp "$TEMPLATE_ROOT/scripts/trim-harness-ci.mjs" "$REPO/scripts/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/package.json" "$REPO/package.json" 2>/dev/null || true
chmod +x "$REPO/scripts/"*.mjs "$REPO/scripts/"*.sh 2>/dev/null || true

# Sample for new projects
if [[ "$MODE" == "new" ]]; then
  copy_tree "$TEMPLATE_ROOT/sample/$SAMPLE_DIR" "$REPO/"
fi

# Evals and prompts
mkdir -p "$REPO/evals/trajectories" "$REPO/evals/e2e-bench" "$REPO/prompts"
cp "$TEMPLATE_ROOT/evals/e2e-bench/manifest.json" "$REPO/evals/e2e-bench/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/evals/e2e-bench/README.md" "$REPO/evals/e2e-bench/" 2>/dev/null || true
mkdir -p "$REPO/evals/e2e-bench/tasks"
cp "$TEMPLATE_ROOT/evals/e2e-bench/tasks/"*.yml "$REPO/evals/e2e-bench/tasks/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/evals/trajectories/test_harness_conventions.py" "$REPO/evals/trajectories/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/evals/trajectories/rubric.md" "$REPO/evals/trajectories/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/evals/.score-baseline.json" "$REPO/evals/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/prompts/"*.prompt.yml "$REPO/prompts/" 2>/dev/null || true

# Stack marker for documentation
echo "$STACK" > "$REPO/.harness-stack"

# Infra optional copy
mkdir -p "$REPO/infra/langfuse" "$REPO/infra/otel" "$REPO/infra/samples"
cp "$TEMPLATE_ROOT/infra/langfuse/docker-compose.yml" "$REPO/infra/langfuse/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/otel/collector-config.yml" "$REPO/infra/otel/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/README.md" "$REPO/infra/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/samples/telemetry-payload.json" "$REPO/infra/samples/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/samples/telemetry-artifact.json" "$REPO/infra/samples/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/samples/gh-aw-dogfood-report.json" "$REPO/infra/samples/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/samples/harness-review-summary.json" "$REPO/infra/samples/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/samples/harness-review-routing-plan.json" "$REPO/infra/samples/" 2>/dev/null || true

echo "Done. Stack=$STACK mode=$MODE"
print_next_step
echo "Then: ./scripts/doctor.mjs --strict"
