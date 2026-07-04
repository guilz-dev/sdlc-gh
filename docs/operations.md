# Operations

Canonical thresholds and policies. All CI gates read from this document.

## Change size limits (arch.md §5.2.2)

| Level | Max LOC | Max files |
|-------|---------|-----------|
| L1 | 300 | 8 |
| L2 | 120 | 4 |
| L3 | 60 | 2 |

L2/L3 labeled PRs **hard fail** CI when exceeded. L1 **warns by default** (template default). Phase 4 allows opt-in L1 hard-fail via `DIFF_SIZE_L1_HARD_FAIL=1` in the `diff-size` CI job when your org is ready to enforce.

To enable L1 hard-fail, uncomment or add in `.github/workflows/harness-ci.yml` under the `diff-size` job:

```yaml
env:
  DIFF_SIZE_L1_HARD_FAIL: "1"
```

`autonomy:L0` is **proposal-only** — no LOC/file limits are enforced (human gate). This matches arch.md §5.2.2; older harness versions treated L0 as L1 limits with warn-only.

## Retry policy (Phase 3)

| Parameter | Value |
|-----------|-------|
| Max retries `N` | 3 |
| Same failure signature | Stop after 2 consecutive identical |
| Cost cap per task | Configure per org (`max-ai-credits`) |

| Failure type | Retry allowed |
|--------------|---------------|
| test | yes |
| lint / type | yes |
| security | no — escalate immediately |
| safe-output / diff-size | conditional — request split |
| same signature ×2 | no |

## Forbidden operations (hooks + CI)

- `git push --force` to protected branches
- `rm -rf /` and destructive filesystem patterns
- Production DB / secrets modification without `task:infra` + human approval

## Single gate

- Human judgment: **PR review only**
- No self-approval where ruleset allows enforcement
- Harness engineer owns `.github/**`, `evals/**`, `docs/telemetry-schema.md`

## Morning queue (outer loop)

Daily ~30 min checklist:

1. Review nightly harness review PRs (gh-aw)
2. Triage `harness:eval-drift` issues
3. Classify failures per [failure-taxonomy.md](failure-taxonomy.md)
4. Update [kpi-baseline.md](kpi-baseline.md) if metrics available

## KPI baseline (Phase 1)

Track weekly per [kpi-baseline.md](kpi-baseline.md). Schema fields in [telemetry-schema.md](telemetry-schema.md).

## L2 autonomy promotion (Phase 4)

Promote `task:docs` to L2 candidate when **all** hold:

- Last 50 tasks: adoption rate > 90%
- Zero major reverts in 90 days
- E2E bench pass@1 stable or improving

Document promotion in PR with evidence links.

## Revert and exceptions (Phase 4)

- Revert procedure: [revert-playbook.md](revert-playbook.md)
- Policy exceptions: [exceptions/README.md](exceptions/README.md) — approver, expiry, revert plan, and principle deviated are required

## Eval governance

### Rubric updates

Review for: validity, reproducibility, bias before merge.

### Schedule

- PR: subset eval by change type matrix
- Weekly: full eval suite

### Drift threshold

If eval pass rate exceeds production acceptance rate by **more than 15 points**, open bench review Issue automatically.

## Secrets naming

| Secret | Purpose |
|--------|---------|
| `EVAL_JUDGE_API_KEY` | DeepEval / LLM-as-judge |
| `GITHUB_TOKEN` | gh models eval (default Actions token often sufficient) |
| `LANGFUSE_PUBLIC_KEY` | Optional telemetry export |
| `LANGFUSE_SECRET_KEY` | Optional telemetry export |

## PR open limit (safe outputs substitute)

Until gh-aw `safe_outputs.max_prs` is active, CI uses **open PR count per author** as a proxy (Phase 0–2: warn; Phase 3+: gh-aw enforces per workflow run).

Warn when an author has more than **3** open PRs at once (`scripts/check-open-pr-limit.mjs`).
