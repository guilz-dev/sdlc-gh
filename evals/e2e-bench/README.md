# E2E task bench

Executable acceptance checks for representative tasks. Each task definition carries
machine-checkable verifiers (`verification_commands`, `verification_contains`,
`verification_not_contains`) so the bench measures more than manifest/file presence.

This is still lighter than a full break-and-fix agent runner: it validates that task
fixtures are reproducible and acceptance checks are real. See `manifest.json`.

Run weekly via `eval-ci.yml` schedule. Expand from 5 to 20 tasks per Phase 4 plan.
