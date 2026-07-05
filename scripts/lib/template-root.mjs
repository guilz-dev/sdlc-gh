#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} dir */
export function isTemplateRoot(dir) {
  return (
    existsSync(join(dir, "scripts/bootstrap-harness.sh")) &&
    existsSync(join(dir, "config/stacks.json")) &&
    existsSync(join(dir, "scripts/setup-wizard.mjs"))
  );
}

/**
 * Resolve the harness template root (source of bootstrap assets).
 * @param {{ fromModule?: string }} [options]
 */
export function resolveTemplateRoot(options = {}) {
  const envRoot = process.env.SDLCGH_TEMPLATE_ROOT?.trim();
  if (envRoot) {
    if (!isTemplateRoot(envRoot)) {
      throw new Error(`SDLCGH_TEMPLATE_ROOT is not a valid harness template: ${envRoot}`);
    }
    return envRoot;
  }

  if (options.fromModule) {
    const fromLib = join(dirname(fileURLToPath(options.fromModule)), "../..");
    if (isTemplateRoot(fromLib)) return fromLib;
  }

  const fromCwd = process.cwd();
  if (isTemplateRoot(fromCwd)) return fromCwd;

  throw new Error(
    "Unable to locate harness template root. Run from the sdlc-gh package, set SDLCGH_TEMPLATE_ROOT, or use `npx @guilz-dev/sdlc-gh init`.",
  );
}
