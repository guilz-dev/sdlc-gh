# gh-aw dogfood track (sdlc-gh on sdlc-gh)

Bounded validation path for [Agentic Workflows (`gh aw`)](https://github.github.com/gh-aw/introduction/overview/) on this repository. **Dogfooding gh-aw is not the same as depending on gh-aw** for core outer-loop operability — see [nightly-harness-review.md](nightly-harness-review.md) for the standard GitHub Actions fallback.

## Purpose

High-signal validation of:

- source `.md` workflows → compiled `.lock.yml`
- safe-output frontmatter boundaries
- reviewable, narrow change scope

## How to run a dogfood task

1. Open an Issue/PR labeled **`task:gh-aw-dogfood`** (+ `autonomy:L0` recommended — proposal only).
2. Limit changes to the allowed paths below.
3. If `.md` sources change, run locally:

   ```bash
   gh aw compile nightly-harness-review.md
   gh aw compile weekly-redteam.md
   git diff .github/workflows/*.lock.yml
   ```

4. Push and let **gh-aw dogfood CI** (`.github/workflows/gh-aw-dogfood-ci.yml`) record pass/fail criteria.

## Allowed path scope

| Area | Paths |
|------|-------|
| gh-aw sources | `.github/workflows/nightly-harness-review.md`, `.github/workflows/weekly-redteam.md` |
| Compiled locks | corresponding `*.lock.yml` |
| Tooling | `scripts/lib/gh-aw-dogfood.mjs`, `scripts/check-gh-aw-dogfood-scope.mjs`, `scripts/validate-gh-aw-compile.mjs`, `scripts/emit-gh-aw-dogfood-report.mjs`, `scripts/test-gh-aw-dogfood-scenarios.mjs` |
| CI | `.github/workflows/gh-aw-dogfood-ci.yml` |
| Labels | `.github/labels.yml` (when adding or updating `task:gh-aw-dogfood`) |
| AW pins | `.github/aw/actions-lock.json` |
| Docs | `docs/gh-aw-dogfood.md`, `docs/nightly-harness-review.md` (gh-aw contract sections only) |

PRs with `task:gh-aw-dogfood` **fail CI** if any changed file is outside this list.

## Evaluation criteria

Recorded in `dogfood-report/gh-aw-dogfood-report.json` (sample: [infra/samples/gh-aw-dogfood-report.json](../infra/samples/gh-aw-dogfood-report.json)):

| Criterion | Pass condition |
|-----------|----------------|
| **scope** | All PR diffs stay within allowed prefixes when `task:gh-aw-dogfood` is set |
| **safe_outputs** | `create-pull-request.max <= 1`; no forbidden auto-merge outputs |
| **compile** | `gh aw compile` succeeds for each source workflow when CLI is present |
| **lock_drift** | `.lock.yml` has `gh-aw-metadata` header; byte-level drift is caught by **compile** |
| **reviewability** | Above gates pass; outputs remain PRs/summaries/issues only |

Set `GH_AW_COMPILE_REQUIRED=1` in CI to hard-fail when `gh aw` is missing (default: skip with warning).

## Explicit constraints (Issue #7)

- Do **not** replace standard GHA nightly aggregation ([nightly-harness-review.yml](../.github/workflows/nightly-harness-review.yml))
- No autonomous merge
- No repo-wide refactors under this track
- Outputs: reviewable artifacts only (PR proposals, compile/drift results, summaries, Issues)

## Comparing runs over time

Download `gh-aw-dogfood-{run_id}` artifacts from Actions and diff `criteria` blocks. Track:

- compile pass rate
- lock drift incidents
- safe-output regressions
- scope violations

### Baseline run (2026-07-04)

First green dogfood CI on `main` after track landing ([#7](https://github.com/guilz-dev/sdlc-gh/issues/7)):

| Field | Value |
|-------|-------|
| Run | [workflow_dispatch `28712363476`](https://github.com/guilz-dev/sdlc-gh/actions/runs/28712363476) |
| Compiler | `gh aw` v0.81.6 (pinned in dogfood CI) |
| `criteria.compile.skipped` | `false` |
| Artifact | `gh-aw-dogfood-28712363476` |

Use this run as the reference point when diffing future dogfood reports.

## Rollback

Trigger rollback when:

- `gh aw` preview/compiler regression breaks compile on unchanged `.md` sources
- safe-output policy is violated in dogfood workflows
- dogfood CI blocks unrelated harness work

**Action:**

1. Revert the `.md` / `.lock.yml` pair (see [revert-playbook.md](revert-playbook.md))
2. Disable or skip `gh-aw-dogfood-ci` until upstream fix is confirmed
3. Keep **GHA outer loop** (`nightly-harness-review.yml`) as the operational baseline

## Tests

```bash
node scripts/test-gh-aw-dogfood-scenarios.mjs
node scripts/validate-gh-aw-compile.mjs   # requires gh aw
```

## Related docs

- [failure-taxonomy.md](failure-taxonomy.md) — outer-loop classification (GHA path)
- [adoption.md](adoption.md) — when to promote beyond dogfood
- [auth-boundaries.md](auth-boundaries.md) — execution mode credentials
