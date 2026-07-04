# Revert playbook

Minimal procedure for rolling back harness or product changes. Operational judgment stays in PR review — this document fixes the steps only.

## When to revert

Choose revert (not forward-fix) when **any** of these hold:

1. **Retry exhaustion** — agent-retry-orchestrator reached max retries with the same failure signature
2. **Bad prompt / instruction change** — merged harness asset caused measurable quality regression (eval drift, spike in wall failures)
3. **Eval drift** — bench pass rate exceeds production acceptance by more than 15 points (see [operations.md](operations.md))
4. **Unapproved policy deviation** — change merged without a valid [exception record](exceptions/README.md)
5. **Production incident** — merged PR is the clear cause of a hotfix or rollback in the product

## Harness asset rollback vs product rollback

| Change type | Revert target | Follow-up |
|-------------|---------------|-----------|
| Harness only (`.github/**`, `evals/**`, `scripts/**`, `docs/**`) | Revert the harness PR on `main` | Re-run `npm run check`; confirm ruleset checks still green |
| Product code only | Revert the product PR | Product CI must pass on the revert PR |
| Mixed harness + product | **Split**: revert harness commit(s) first, then product if needed | Never leave harness in a half-upgraded state |

Bootstrap/sync PRs that touch both: revert the **entire** sync PR, then re-apply product changes without harness assets if required.

## Retry exhaustion / bad prompt / eval drift

1. Identify the merge commit or PR that introduced the regression
2. Open a revert PR (`git revert <sha>` or GitHub UI **Revert**)
3. Link the original PR, failure taxonomy class ([failure-taxonomy.md](failure-taxonomy.md)), and any eval-drift Issue
4. If the root cause was a harness asset change, add a follow-up Issue to fix forward with eval evidence — do not re-merge without passing eval CI

## Revert PR must include

- [ ] Link to the original PR and Issue (if any)
- [ ] Failure class (`feed-forward`, `wall`, `model`, or `eval-drift`)
- [ ] Evidence: CI logs, eval scores, or trace search query
- [ ] Rollback hints from the original Issue CC-SD contract (when applicable)
- [ ] Confirmation that required status checks pass on the revert PR

## After revert

1. Post in the morning queue ([operations.md](operations.md)) if the incident affects KPI baseline
2. If an [exception](exceptions/README.md) was involved, close or expire the exception record
3. For harness changes, run `npm run drift-report` before the next sync attempt
