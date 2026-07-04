# E2E task bench

Executable acceptance checks for representative tasks. Each task definition carries
machine-checkable verifiers (`verification_commands`, `verification_contains`,
`verification_not_contains`) so the bench measures more than manifest/file presence.

This is still lighter than a full break-and-fix agent runner: it validates that task
fixtures are reproducible and acceptance checks are real. See `manifest.json`.

Run weekly via `eval-ci.yml` schedule. Current manifest: **9 tasks** (target 20–100 in a future break-and-fix runner).

## Runner boundary (current vs planned)

| Concern | Current (`run-e2e-bench.mjs`) | Planned break-and-fix runner |
|---------|-------------------------------|------------------------------|
| **Task input** | Static YAML fixture in `tasks/*.yml` | Issue + CC-SD contract + repo snapshot |
| **Expected artifact** | File content / command exit code | Agent-produced PR diff |
| **Verifier contract** | `verification_*` fields in task YAML | Same fields + agent execution harness |
| **Result summary** | Per-task ok/fail; class/stack counts; executed/skipped/failed totals | Above + pass@1, retry count, wall failure class |

Validation before run: `scripts/check-e2e-manifest.mjs` (duplicate id, orphan files, unsupported class, `min_tasks`, `last_rotated`).

Local:

```bash
npm run check-e2e   # manifest only
npm run run-e2e     # manifest + executable checks
```
