#!/usr/bin/env node
/**
 * Read stack catalog from config/stacks.json.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG_PATH = join(ROOT, "config/stacks.json");

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
