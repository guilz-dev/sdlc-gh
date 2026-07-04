import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Merge harness npm scripts into an existing package.json without overwriting
 * application metadata or dependencies.
 *
 * @param {string} templatePath harness template package.json
 * @param {string} targetPath product repository package.json
 * @returns {{ action: "created" | "merged", scriptCount: number }}
 */
export function mergeHarnessPackageJson(templatePath, targetPath) {
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  const harnessScripts = template.scripts ?? {};

  if (!existsSync(targetPath)) {
    const created = {
      private: true,
      type: "module",
      description: "Harness tooling scripts (Node.js required for local checks only)",
      scripts: harnessScripts,
    };
    writeFileSync(targetPath, `${JSON.stringify(created, null, 2)}\n`, "utf8");
    return { action: "created", scriptCount: Object.keys(harnessScripts).length };
  }

  const existing = JSON.parse(readFileSync(targetPath, "utf8"));
  const merged = {
    ...existing,
    scripts: {
      ...(existing.scripts ?? {}),
      ...harnessScripts,
    },
  };
  writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { action: "merged", scriptCount: Object.keys(harnessScripts).length };
}
