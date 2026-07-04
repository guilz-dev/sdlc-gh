---
description: Weekly red team probe suite (garak).
name: Weekly red team
on:
  schedule:
    - cron: "0 3 * * 0"
permissions:
  contents: read
  issues: read
safe-outputs:
  create-issue:
    max: 2
---

# Weekly red team (gh-aw source)

> **Operational baseline:** No standard GHA replacement yet — probes are **manual / scheduled stub** until garak runtime prerequisites exist. Dogfood validates compile + safe-outputs only.

## Required inputs

| Input | Source | Required |
|-------|--------|----------|
| Probe definitions | garak / harness red-team config (future) | best-effort |
| Target scope | Repository harness surfaces (agents, hooks, workflows) | yes |
| Prior weekly summary | Previous `create-issue` or morning queue entry | optional |

## Forbidden operations

- Do **not** open pull requests (no `create-pull-request` safe-output)
- Do **not** exfiltrate secrets or modify production credentials
- Do **not** run unbounded network probes outside AWF allowlist
- Do **not** block the GHA nightly harness review path

## Expected outputs

| Output | Format | Limit |
|--------|--------|-------|
| Red-team findings | GitHub issue with severity + repro steps | `create-issue.max: 2` |
| Morning queue note | Markdown summary (issue body section) | human-readable |

## Probe contract

When garak (or equivalent) is available:

1. Run the configured probe suite against agent prompts and harness docs
2. Record pass/fail per probe with `wall_failure_type: security` when applicable
3. Open at most **two** issues for high-severity findings

Until runtime exists, emit a single issue stating `status: stub — probes not executed` if scheduled.

## Escalation

- **Critical** injection or secret-leak signal → open issue immediately; do not retry autonomously
- Repeated probe failures on unchanged harness → route to [failure-taxonomy.md](../../docs/failure-taxonomy.md) **モデル限界** / human review

## Fallback when gh-aw or garak regresses

1. Skip probe execution; open a single tracking issue if the schedule fired
2. Keep [nightly-harness-review.yml](./nightly-harness-review.yml) GHA path operational
3. Revert `.md` / `.lock.yml` via dogfood rollback ([docs/gh-aw-dogfood.md](../../docs/gh-aw-dogfood.md))

## Promotion criteria (gh-aw vs manual)

Enable gh-aw weekly execution when:

- garak (or substitute) runs in CI or AWF sandbox with pinned version
- Dogfood safe-output checks pass (`create-issue.max <= 2`, no auto-merge)
- At least one dry-run weekly report matches manual probe results

## Agent instructions

Run the garak probe suite when tooling is present and report results to the morning queue.

When tooling is **missing**, create a stub issue documenting `garak: not available` and reference [infra/README.md](../../infra/README.md) threat-detection placeholder.

Do not auto-merge. Do not modify product code.
