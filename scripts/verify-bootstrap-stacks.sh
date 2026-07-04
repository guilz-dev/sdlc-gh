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
}

for stack in $STACKS; do
  target="$TMP/${stack}-new"
  "$ROOT/scripts/bootstrap-harness.sh" --repo "$target" --stack "$stack" --mode new
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

  "$ROOT/scripts/bootstrap-harness.sh" --repo "$target" --stack "$stack" --mode existing
  assert_bootstrapped_repo "$stack" "$target"

  if [[ -d "$target/sample" ]]; then
    echo "existing mode should not copy sample/ tree for stack=$stack" >&2
    exit 1
  fi
done

echo "Bootstrap verification passed (${STACKS// /, }, modes=new+existing)"
