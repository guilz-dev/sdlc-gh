# Adoption Guide

Apply this harness template to any repository.

## Prerequisites

- GitHub repository with Actions enabled
- GitHub Copilot (Business or Enterprise) for coding agent features
- Optional: self-hosted Langfuse for telemetry

## New repository

1. Use **GitHub Template repository** → Create new repository from this template.
2. Or run the wizard (recommended):

```bash
cd /path/to/new-product
npx @guilz-dev/sdlc-gh
```

3. Or run bootstrap manually, then wizard:

```bash
git clone <harness-template-url> /tmp/harness
/tmp/harness/scripts/bootstrap-harness.sh \
  --repo /path/to/new-product \
  --stack ts \
  --mode new \
  --codeowners-team @your-org/harness-engineers
cd /path/to/new-product && npx @guilz-dev/sdlc-gh --yes --stack ts --codeowners @your-org/harness-engineers
```

3. Run `./scripts/setup-github.sh` to sync labels and create/update the `main-protection` ruleset.
4. *(Optional, Phase 3)* After eval CI is green in your org, run `./scripts/setup-github.sh --with-eval-ruleset` to create/update the `harness-pr-eval-required` ruleset. The template ruleset applies to all PRs targeting `main`; narrow conditions in GitHub Settings if you only want harness-asset PRs blocked. GitHub Models enablement is still required before `prompt-eval` can block merges.
5. Run `./scripts/doctor.mjs --strict` and fix any remaining failures.
6. Manual fallback: import `.github/ruleset.example.json` and apply `.github/labels.yml` if `gh` cannot be used.

## GitHub setup order

Apply in this order (or run `./scripts/setup-wizard.mjs` to perform steps 1–2 and verify with doctor):

1. **Labels sync** — `task:*` and `autonomy:*` from `.github/labels.yml`
2. **Main protection** — `main-protection` ruleset with harness + product CI checks
3. **Optional eval ruleset** — `--with-eval-ruleset` adds `harness-pr-eval-required` (eval CI checks only; does not enable GitHub Models). This ruleset targets `main` and requires `select` + `trajectory-conventions` on **all** PRs to that branch — enable only when your org accepts that cost, or narrow the ruleset conditions in GitHub Settings after creation.

### Setup wizard

`./scripts/setup-wizard.mjs` orchestrates Phase 0–1 install settings:

- writes `.harness-stack` (primary stack for rulesets)
- replaces the `CODEOWNERS` placeholder on **product repos** (skipped by default with `--template`)
- runs `setup-github.sh` (labels + rulesets)
- runs `doctor --strict` (pass `--template` for multi-stack template repos)

Non-interactive flags: `--yes`, `--stack`, `--codeowners`, `--github-repo`, `--with-eval-ruleset`, `--skip-github`, `--dry-run`, `--patch-codeowners` (opt-in CODEOWNERS replacement in template mode), `--force-bootstrap` (destructive; never with `--yes`).

## Behavior / spec corrections (template updates)

When pulling harness updates, review these intentional behavior alignments with [arch.md](arch.md):

| Area | Current spec | Legacy behavior |
|------|--------------|-----------------|
| `autonomy:L0` diff-size | Proposal only — no LOC/file gate | Some versions applied L1 limits with warn |
| L1 over-limit | Warn by default; opt-in hard-fail via `DIFF_SIZE_L1_HARD_FAIL=1` | — |

## Existing repository (phased)

| Step | Assets | Risk |
|------|--------|------|
| 1 | FF only: instructions, agents, hooks, templates | Low |
| 2 | `harness-ci.yml` + stack `product-ci` | Medium |
| 3 | Eval CI + ruleset eval required | Medium |
| 4 | Coding agent L1 on `task:docs` / `task:test-fix` (CC-SD contract required) | Low tasks first |

gh-aw outer loop: use the **gh-aw dogfood track** ([gh-aw-dogfood.md](gh-aw-dogfood.md)) for bounded `gh aw compile` validation on `sdlc-gh` itself. Standard GHA aggregation remains the operational baseline — see [nightly-harness-review.md](nightly-harness-review.md). Do not enable unrestricted gh-aw across the repo until dogfood criteria stay green over multiple runs.

```bash
./scripts/bootstrap-harness.sh \
  --repo /path/to/existing \
  --codeowners-team @your-org/harness-engineers
cd /path/to/existing
npx @guilz-dev/sdlc-gh --yes --stack ts --codeowners @your-org/harness-engineers
```

Or skip manual bootstrap entirely:

```bash
cd /path/to/existing
npx @guilz-dev/sdlc-gh
```

## Stack selection

| Stack | Profile | Sample | CI workflow |
|-------|---------|--------|-------------|
| `ts` | `typescript.instructions.md` | `sample/ts/` | `product-ci-ts.yml` |
| `python` | `python.instructions.md` | `sample/python/` | `product-ci-python.yml` |
| `go` | `go.instructions.md` | `sample/go/` | `product-ci-go.yml` |
| `ruby` | `ruby.instructions.md` | `sample/ruby/` | `product-ci-ruby.yml` |
| `php` | `php.instructions.md` | `sample/php/` | `product-ci-php.yml` |

Stack metadata is centralized in [`config/stacks.json`](../config/stacks.json). Bootstrap copies **only** the selected stack's profile and `product-ci-*` workflow, and replaces the `CODEOWNERS` team placeholder at install time.

## CC-SD contract (L1 only in v1)

Phase 4 L1 delegation uses a lightweight **Issue-embedded CC-SD contract** — not a separate spec file. v1 enforces the contract only for `task:docs` and `task:test-fix` at `autonomy:L1` via the `issue-spec-check` CI job. `feature-small`, `infra`, and `security-sensitive` are out of scope until a later version.

Required Issue fields: `Goal`, `Non-goals`, `Constraints`, `Acceptance criteria`, `Rollback hints`. See [coding-agent-l1.md](coding-agent-l1.md). Enforcement uses Issue **labels** (`task:*`, `autonomy:*`), not the form dropdown alone.

`issue-spec-check` is safe to keep always required: non-L1 and unlinked PRs exit successfully (warn/skip only).

## Sync from canonical template (Phase 4)

Use `harness-sync.yml` or subtree merge to pull harness updates. Review drift report before merge.

## Rollback

See [revert-playbook.md](revert-playbook.md) for the canonical procedure. Quick steps:

1. Revert the bootstrap commit or sync PR.
2. Disable required status checks for `harness-ci` in ruleset.
3. Remove `.github/agents` if coding agent assignment causes issues.

## Multi-project rollout

Target **3+ product repos** sharing the same template version. Pin template ref in `harness-sync.yml`.
