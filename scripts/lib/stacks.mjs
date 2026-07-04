#!/usr/bin/env node
/**
 * Read stack catalog from config/stacks.json and infer stack/mode candidates.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG_PATH = join(ROOT, "config/stacks.json");
export const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".venv",
  "dist",
  "build",
  "coverage",
  "tmp",
  "sample",
]);

let cached;

export function loadStacks() {
  if (!cached) {
    cached = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  }
  return cached.stacks;
}

export function getStack(id) {
  const stack = loadStacks().find((s) => s.id === id);
  if (!stack) {
    throw new Error(`Unknown stack: ${id}`);
  }
  return stack;
}

export function stackIds() {
  return loadStacks().map((s) => s.id);
}

function walk(dir, root, markersByName, nestedMatches) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (DEFAULT_EXCLUDED_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), root, markersByName, nestedMatches);
      continue;
    }

    const stacks = markersByName.get(entry.name);
    if (!stacks) continue;

    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    if (!relPath || relPath === entry.name) continue;

    for (const stack of stacks) {
      nestedMatches.push({ stackId: stack.id, path: relPath });
    }
  }
}

export function detectStackCandidates(repoPath) {
  const repoRoot = resolve(repoPath);
  const stacks = loadStacks();
  const rootMatches = [];
  const nestedMatches = [];

  for (const stack of stacks) {
    if (existsSync(join(repoRoot, stack.marker))) {
      rootMatches.push({ stackId: stack.id, path: stack.marker });
    }
  }

  if (existsSync(repoRoot) && statSync(repoRoot).isDirectory()) {
    const markersByName = new Map();
    for (const stack of stacks) {
      const key = basename(stack.marker);
      const values = markersByName.get(key) ?? [];
      values.push(stack);
      markersByName.set(key, values);
    }
    walk(repoRoot, repoRoot, markersByName, nestedMatches);
  }

  const rootStackIds = [...new Set(rootMatches.map((m) => m.stackId))];
  const nestedStackIds = [...new Set(nestedMatches.map((m) => m.stackId))];
  const suggested =
    rootStackIds.length === 1
      ? rootStackIds[0]
      : rootStackIds.length === 0 && nestedStackIds.length === 1 && nestedStackIds[0] !== "ts"
        ? nestedStackIds[0]
        : null;

  return {
    repoRoot,
    rootMatches,
    nestedMatches,
    suggested,
    ambiguous:
      rootStackIds.length > 1 ||
      nestedStackIds.length > 1 ||
      (rootStackIds.length === 0 && nestedStackIds.length === 1 && nestedStackIds[0] === "ts"),
  };
}

export function inspectRepoMode(repoPath) {
  const target = resolve(repoPath);
  if (!existsSync(target)) {
    return { suggested: "new", reason: "target directory does not exist", ambiguous: false };
  }
  if (!statSync(target).isDirectory()) {
    throw new Error(`Not a directory: ${target}`);
  }

  const entries = readdirSync(target).filter((entry) => entry !== ".DS_Store");
  if (entries.length === 0) {
    return { suggested: "new", reason: "target directory is empty", ambiguous: false };
  }

  const nonGitEntries = entries.filter((entry) => entry !== ".git");
  if (nonGitEntries.length === 0) {
    return { suggested: null, reason: "target contains only .git", ambiguous: true };
  }

  const rootMarkers = loadStacks().filter((stack) => existsSync(join(target, stack.marker)));
  if (rootMarkers.length > 0) {
    return { suggested: "existing", reason: "detected existing stack marker files", ambiguous: false };
  }

  if (nonGitEntries.every((entry) => /^README(\..+)?$/i.test(entry) || entry === ".gitignore")) {
    return { suggested: null, reason: "target looks like a seed repository", ambiguous: true };
  }

  return { suggested: "existing", reason: "target already contains files", ambiguous: false };
}
