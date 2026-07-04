#!/usr/bin/env bash
# Bootstrap verification for all supported stacks (new + existing modes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/harness-verify-$$"
mkdir -p "$TMP"

cd "$ROOT"

STACKS="$(node --input-type=module -e "
  import { loadStacks } from './scripts/lib/stacks.mjs';
  console.log(loadStacks().map((s) => s.id).join(' '));
")"

assert_bootstrapped_repo() {
  local stack="$1"
  local target="$2"

  local check_file workflow harness_ci product_ci_count
  check_file="$(node --input-type=module -e "
    import { getStack } from './scripts/lib/stacks.mjs';
    console.log(getStack('${stack}').bootstrapCheck);
  ")"
  workflow="$(node --input-type=module -e "
    import { getStack } from './scripts/lib/stacks.mjs';
    console.log(getStack('${stack}').workflow);
  ")"

  test -f "$target/$check_file"
  test -f "$target/.github/workflows/harness-ci.yml"
  test -f "$target/.github/workflows/eval-ci.yml"
  test -f "$target/.github/workflows/$workflow"

  product_ci_count="$(find "$target/.github/workflows" -maxdepth 1 -name 'product-ci-*.yml' | wc -l | tr -d ' ')"
  if [[ "$product_ci_count" != "1" ]]; then
    echo "Expected exactly one product-ci workflow for stack=$stack, found $product_ci_count" >&2
    exit 1
  fi

  harness_ci="$target/.github/workflows/harness-ci.yml"
  for other in $STACKS; do
    if [[ "$other" != "$stack" ]] && grep -q "product-${other}:" "$harness_ci"; then
      echo "harness-ci.yml not trimmed for stack=$stack (found product-${other})" >&2
      exit 1
    fi
  done
  if ! grep -q "product-${stack}:" "$harness_ci"; then
    echo "harness-ci.yml missing product-${stack} job" >&2
    exit 1
  fi

  if grep -q "@your-org/harness-engineers" "$target/.github/CODEOWNERS"; then
    echo "CODEOWNERS placeholder was not replaced for stack=$stack" >&2
    exit 1
  fi

  for lib in bootstrap-copy.mjs diff-size.mjs e2e-manifest.mjs doctor-local.mjs github-config.mjs; do
    if [[ ! -f "$target/scripts/lib/$lib" ]]; then
      echo "bootstrap missing scripts/lib/$lib for stack=$stack" >&2
      exit 1
    fi
  done

  if [[ ! -f "$target/docs/revert-playbook.md" ]]; then
    echo "bootstrap missing docs/revert-playbook.md for stack=$stack" >&2
    exit 1
  fi

  if [[ ! -f "$target/infra/samples/telemetry-payload.json" ]]; then
    echo "bootstrap missing infra/samples/telemetry-payload.json for stack=$stack" >&2
    exit 1
  fi

  (
    cd "$target"
    node scripts/check-e2e-manifest.mjs >/dev/null
    node scripts/test-diff-size-scenarios.mjs >/dev/null
  )
}

for stack in $STACKS; do
  target="$TMP/${stack}-new"
  "$ROOT/scripts/bootstrap-harness.sh" --repo "$target" --stack "$stack" --mode new --codeowners-team @acme/platform --yes
  assert_bootstrapped_repo "$stack" "$target"
done

for stack in $STACKS; do
  target="$TMP/${stack}-existing"
  mkdir -p "$target"

  check_file="$(node --input-type=module -e "
    import { getStack } from './scripts/lib/stacks.mjs';
    console.log(getStack('${stack}').bootstrapCheck);
  ")"
  sample_dir="$(node --input-type=module -e "
    import { getStack } from './scripts/lib/stacks.mjs';
    console.log(getStack('${stack}').sampleDir);
  ")"

  cp "$ROOT/sample/$sample_dir/$check_file" "$target/$check_file" 2>/dev/null \
    || touch "$target/$check_file"

  "$ROOT/scripts/bootstrap-harness.sh" --repo "$target" --stack "$stack" --mode existing --codeowners-team @acme/platform --yes
  assert_bootstrapped_repo "$stack" "$target"

  if [[ -d "$target/sample" ]]; then
    echo "existing mode should not copy sample/ tree for stack=$stack" >&2
    exit 1
  fi
done

for stack in $STACKS; do
  target="$TMP/${stack}-auto-existing"
  mkdir -p "$target"

  check_file="$(node --input-type=module -e "
    import { getStack } from './scripts/lib/stacks.mjs';
    console.log(getStack('${stack}').bootstrapCheck);
  ")"
  sample_dir="$(node --input-type=module -e "
    import { getStack } from './scripts/lib/stacks.mjs';
    console.log(getStack('${stack}').sampleDir);
  ")"
  cp "$ROOT/sample/$sample_dir/$check_file" "$target/$check_file" 2>/dev/null || touch "$target/$check_file"

  (
    cd "$target"
    "$ROOT/scripts/bootstrap-harness.sh" --codeowners-team @acme/platform --yes
  )
  assert_bootstrapped_repo "$stack" "$target"
done

target="$TMP/auto-new"
mkdir -p "$target"
(
  cd "$target"
  "$ROOT/scripts/bootstrap-harness.sh" --stack ts --codeowners-team @acme/platform --yes
)
assert_bootstrapped_repo "ts" "$target"

ambiguous="$TMP/ambiguous-stack"
mkdir -p "$ambiguous"
touch "$ambiguous/package.json" "$ambiguous/requirements-dev.txt"
if "$ROOT/scripts/bootstrap-harness.sh" --repo "$ambiguous" --mode existing --codeowners-team @acme/platform --yes; then
  echo "Expected bootstrap to fail for ambiguous stack detection" >&2
  exit 1
fi

git_only="$TMP/git-only"
mkdir -p "$git_only"
git -C "$git_only" init >/dev/null 2>&1
if "$ROOT/scripts/bootstrap-harness.sh" --repo "$git_only" --stack ts --codeowners-team @acme/platform --yes; then
  echo "Expected bootstrap to fail for ambiguous mode detection (.git only)" >&2
  exit 1
fi

seed_repo="$TMP/seed-repo"
mkdir -p "$seed_repo"
touch "$seed_repo/README.md"
if "$ROOT/scripts/bootstrap-harness.sh" --repo "$seed_repo" --stack ts --codeowners-team @acme/platform --yes; then
  echo "Expected bootstrap to fail for seed repo mode detection" >&2
  exit 1
fi

nested_ts="$TMP/nested-ts"
mkdir -p "$nested_ts/tools"
touch "$nested_ts/tools/package.json"
if "$ROOT/scripts/bootstrap-harness.sh" --repo "$nested_ts" --mode existing --codeowners-team @acme/platform --yes; then
  echo "Expected bootstrap to fail for nested TypeScript-only detection" >&2
  exit 1
fi

echo "Bootstrap verification passed (${STACKS// /, }, modes=new+existing)"
