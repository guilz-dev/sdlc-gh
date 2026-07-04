#!/usr/bin/env bash
set -euo pipefail

REPO=""
STACK="ts"
MODE="existing"
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
  echo "Usage: $0 --repo <path> --stack <${ids}> [--mode new|existing]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --stack) STACK="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$REPO" ]] && usage
[[ ! -d "$REPO" ]] && mkdir -p "$REPO"

if ! node --input-type=module -e "
  import { getStack } from 'file://${TEMPLATE_ROOT}/scripts/lib/stacks.mjs';
  getStack('${STACK}');
" 2>/dev/null; then
  echo "Unknown stack: $STACK" >&2
  usage
fi

PROFILE="$(stack_field profile)"
PRODUCT_CI="$(stack_field workflow)"
SAMPLE_DIR="$(stack_field sampleDir)"

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

echo "Bootstrapping harness into $REPO (stack=$STACK, mode=$MODE)"

# Core docs
mkdir -p "$REPO/docs" "$REPO/docs/exceptions"
for f in operations.md adoption.md auth-boundaries.md failure-taxonomy.md telemetry-schema.md \
  shared-config.md coding-agent-l1.md kpi-baseline.md; do
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
cp "$TEMPLATE_ROOT/.github/ruleset.example.json" "$REPO/.github/" 2>/dev/null || true

mkdir -p "$REPO/.github/instructions/profiles"
cp "$TEMPLATE_ROOT/.github/instructions/core.instructions.md" "$REPO/.github/instructions/"
cp "$TEMPLATE_ROOT/.github/instructions/profiles/$PROFILE" "$REPO/.github/instructions/profiles/"

# Workflows — core + selected stack product CI + phase 2–4
mkdir -p "$REPO/.github/workflows"
for wf in harness-ci.yml copilot-setup-steps.yml pr-context-comment.yml eval-ci.yml eval-drift.yml \
  agent-retry-orchestrator.yml harness-sync.yml labels-sync.yml; do
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
  check-e2e-manifest.mjs validate-telemetry.mjs check-open-pr-limit.mjs \
  test-hooks-scenarios.mjs test-issue-spec-scenarios.mjs harness-drift-report.mjs \
  check-eval-score-drift.mjs run-e2e-bench.mjs; do
  cp "$TEMPLATE_ROOT/scripts/$s" "$REPO/scripts/" 2>/dev/null || true
done
cp "$TEMPLATE_ROOT/scripts/lib/stacks.mjs" "$REPO/scripts/lib/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/scripts/lib/harness-ci-fragments.mjs" "$REPO/scripts/lib/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/scripts/lib/ccsd-contract.mjs" "$REPO/scripts/lib/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/scripts/trim-harness-ci.mjs" "$REPO/scripts/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/scripts/verify-bootstrap-stacks.sh" "$REPO/scripts/" 2>/dev/null || true
chmod +x "$REPO/scripts/"*.mjs "$REPO/scripts/verify-bootstrap-stacks.sh" 2>/dev/null || true

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
mkdir -p "$REPO/infra/langfuse" "$REPO/infra/otel"
cp "$TEMPLATE_ROOT/infra/langfuse/docker-compose.yml" "$REPO/infra/langfuse/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/otel/collector-config.yml" "$REPO/infra/otel/" 2>/dev/null || true
cp "$TEMPLATE_ROOT/infra/README.md" "$REPO/infra/" 2>/dev/null || true

echo "Done. Stack=$STACK mode=$MODE"
echo "Next: enable ruleset (.github/ruleset.example.json), run labels-sync workflow, configure CODEOWNERS."
