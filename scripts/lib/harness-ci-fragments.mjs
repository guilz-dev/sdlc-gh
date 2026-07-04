#!/usr/bin/env node
/**
 * Generate harness-ci detect/product fragments from stack catalog.
 */
import { loadStacks, getStack } from "./stacks.mjs";

export function stacksForHarness(stackId = null) {
  const stacks = loadStacks();
  if (stackId) {
    return [getStack(stackId)];
  }
  return stacks;
}

export function buildDetectOutputs(stacks) {
  return stacks.map((s) => `      ${s.id}: \${{ steps.detect.outputs.${s.id} }}`).join("\n");
}

export function buildDetectRun(stacks) {
  return stacks
    .map((s) => {
      const samplePath = `sample/${s.sampleDir}/${s.marker}`;
      return `          if [[ -f ${samplePath} || -f ${s.marker} ]]; then
            echo "${s.id}=true" >> "$GITHUB_OUTPUT"
          else
            echo "${s.id}=false" >> "$GITHUB_OUTPUT"
          fi`;
    })
    .join("\n");
}

export function buildProductJobs(stacks) {
  return stacks
    .map(
      (s) => `  product-${s.id}:
    name: product-ci-${s.id}
    needs: detect-projects
    if: needs.detect-projects.outputs.${s.id} == 'true'
    uses: ./.github/workflows/${s.workflow}`,
    )
    .join("\n\n");
}

export function patchHarnessCi(content, stacks) {
  const outputs = buildDetectOutputs(stacks);
  const detectRun = buildDetectRun(stacks);
  const productJobs = buildProductJobs(stacks);

  const outputsRe = /(    outputs:\n)([\s\S]*?)(    steps:)/;
  if (!outputsRe.test(content)) {
    throw new Error("harness-ci.yml: could not find detect-projects outputs block");
  }
  let patched = content.replace(outputsRe, `$1${outputs}\n$3`);

  const runRe = /(      - id: detect\n        shell: bash\n        run: \|\n)([\s\S]*?)(\n  product-)/;
  if (!runRe.test(patched)) {
    throw new Error("harness-ci.yml: could not find detect-projects run block");
  }
  patched = patched.replace(runRe, `$1${detectRun}\n$3`);

  const productRe = /(  product-ts:[\s\S]*)$/;
  if (!productRe.test(patched)) {
    throw new Error("harness-ci.yml: could not find product-* jobs block");
  }
  patched = patched.replace(productRe, productJobs + "\n");

  return patched;
}
