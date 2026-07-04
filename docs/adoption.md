# Adoption Guide

Apply this harness template to any repository.

## Prerequisites

- GitHub repository with Actions enabled
- GitHub Copilot (Business or Enterprise) for coding agent features
- Optional: self-hosted Langfuse for telemetry

## New repository

1. Use **GitHub Template repository** → Create new repository from this template.
2. Or run bootstrap:

```bash
git clone <harness-template-url> /tmp/harness
/tmp/harness/scripts/bootstrap-harness.sh --repo /path/to/new-product --stack ts --mode new
cd /path/to/new-product && git add -A && git commit -m "Add agent harness"
```

3. Enable branch protection / ruleset (see `.github/ruleset.example.json`).
4. Run **Sync labels** workflow once (or push to `labels.yml`) to apply `task:*` and `autonomy:*` labels.
5. Configure CODEOWNERS with your team handles.

## Existing repository (phased)

| Step | Assets | Risk |
|------|--------|------|
| 1 | FF only: instructions, agents, hooks, templates | Low |
| 2 | `harness-ci.yml` + stack `product-ci` | Medium |
| 3 | Eval CI + ruleset eval required | Medium |
| 4 | Coding agent L1 on `task:docs` / `task:test-fix` | Low tasks first |

```bash
./scripts/bootstrap-harness.sh --repo /path/to/existing --stack python --mode existing
```

## Stack selection

| Stack | Profile | Sample | CI workflow |
|-------|---------|--------|-------------|
| `ts` | `typescript.instructions.md` | `sample/ts/` | `product-ci-ts.yml` |
| `python` | `python.instructions.md` | `sample/python/` | `product-ci-python.yml` |
| `go` | `go.instructions.md` | `sample/go/` | `product-ci-go.yml` |
| `ruby` | `ruby.instructions.md` | `sample/ruby/` | `product-ci-ruby.yml` |
| `php` | `php.instructions.md` | `sample/php/` | `product-ci-php.yml` |

Stack metadata is centralized in [`config/stacks.json`](../config/stacks.json). Bootstrap copies **only** the selected stack's profile and `product-ci-*` workflow.

## Sync from canonical template (Phase 4)

Use `harness-sync.yml` or subtree merge to pull harness updates. Review drift report before merge.

## Rollback

1. Revert the bootstrap commit or sync PR.
2. Disable required status checks for `harness-ci` in ruleset.
3. Remove `.github/agents` if coding agent assignment causes issues.

## Multi-project rollout

Target **3+ product repos** sharing the same template version. Pin template ref in `harness-sync.yml`.
