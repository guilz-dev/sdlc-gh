# SDLC-GH

**An agent harness template for GitHub Copilot — deterministic guardrails for AI coding agents.**

sdlc-gh is a template repository that keeps AI coding agents on track with **CI walls, hooks, evals, and operational policy** instead of prompt discipline alone. It is organization-agnostic and stack-agnostic (TypeScript / Python / Go / Ruby / PHP): copy it into any product repository and adapt it.

> The CI and documentation parts work standalone, but coding agent and gh-aw integration require GitHub Copilot (Business / Enterprise).

## Why

Teams adopting Copilot coding agent quickly run into the same problems:

- Agents open oversized PRs
- Destructive operations aren't reliably blocked
- Changing instructions has untracked effects on quality
- Approval points multiply until review becomes rubber-stamping

sdlc-gh addresses these with three design rules:

1. **Walls are deterministic** — tests, lint, diff-size limits, and hooks stop bad changes mechanically
2. **One human gate: PR review** — decision inputs (scores, cost, traces) are collected on the PR
3. **No harness change without an eval** — changes to instructions / agents / skills are verified in CI

The full architecture and rationale live in [docs/arch.md](docs/arch.md).

## Quick start

Requirements: a GitHub repository with Actions enabled; Node.js 22+; `gh` CLI authenticated for GitHub setup.

**Recommended — wizard in your product repo (no clone)**

```bash
cd /path/to/your-product
npx @guilz-dev/sdlc-gh
```

The wizard bootstraps harness assets (if missing), syncs labels/rulesets, and runs `doctor --strict`. Non-interactive example:

```bash
npx @guilz-dev/sdlc-gh init --yes --stack ts --codeowners @your-org/harness-engineers --mode existing
```

New empty directory with sample stack copied to root:

```bash
mkdir my-product && cd my-product && git init
npx @guilz-dev/sdlc-gh init --yes --stack ts --codeowners @your-org/harness-engineers --mode new --skip-github
```

Before the first npm release: `npx github:guilz-dev/sdlc-gh`. Local dev: `node scripts/sdlc-gh-cli.mjs`.

**Option A — new repository from template (easiest)**

Click **Use this template** on GitHub, delete the `sample/` stacks you don't need, and add your code.

**Option B — add the harness to an existing repository (manual bootstrap)**

```bash
git clone https://github.com/YOUR_ORG/sdlc-gh.git /tmp/sdlc-gh

/tmp/sdlc-gh/scripts/bootstrap-harness.sh \
  --repo /path/to/your-product \
  --codeowners-team @your-org/harness-engineers

cd /path/to/your-product
npx @guilz-dev/sdlc-gh --yes --stack ts --codeowners @your-org/harness-engineers
```

**Option C — start a brand-new product**

```bash
/tmp/sdlc-gh/scripts/bootstrap-harness.sh \
  --repo /path/to/new-product \
  --stack ts \
  --mode new \
  --codeowners-team @your-org/harness-engineers

cd /path/to/new-product
npx @guilz-dev/sdlc-gh --yes --stack ts --codeowners @your-org/harness-engineers --mode new
```

`--mode new` expands the minimal `sample/{stack}/` project into the repository root.

### After installing (required)

The harness is active only after GitHub setup and a clean doctor run:

1. **Setup wizard (recommended)** — run `./scripts/setup-wizard.mjs` to configure `.harness-stack`, `CODEOWNERS`, GitHub labels/rulesets, and verify with `doctor --strict`. Use `--template` when dogfooding the multi-stack template repository.
2. **Bootstrap** — run `./scripts/bootstrap-harness.sh` and confirm the detected stack/mode summary (alternative to the wizard for copy-only installs).
3. **Configure GitHub** — the wizard runs `setup-github.sh` automatically; or run it manually to sync labels and create/update the `main-protection` ruleset with your stack's `product-ci-*` check. Optionally add `--with-eval-ruleset` after eval CI is stable.
4. **Verify** — run `./scripts/doctor.mjs --strict` until every required item passes (`--template` for the template repo).

Manual fallback remains available for restricted environments:

- Apply labels from [.github/labels.yml](.github/labels.yml)
- Import [.github/ruleset.example.json](.github/ruleset.example.json) under *Settings → Rules*
- Ensure required checks include `harness-static`, `diff-size`, `issue-spec-check`, and your stack's `product-ci-*`

Detailed steps and rollback guidance: [docs/adoption.md](docs/adoption.md).

## Configuration

| Setting | Location | Purpose |
|---------|----------|---------|
| Primary stack | `.harness-stack` (gitignored locally) | Selects `product-ci-{stack}` for rulesets and doctor |
| Harness review owners | `.github/CODEOWNERS` | Required reviewers for `.github/`, `evals/`, policy docs. **Product repos:** replace placeholder and commit. **This template repo:** keep `@your-org/harness-engineers` in git; use `--template` wizard mode locally. |
| Task / autonomy labels | `.github/labels.yml` → GitHub | Issue/PR classification (`task:*`, `autonomy:*`) |
| Branch protection | `main-protection` ruleset | Required CI checks + code owner review |
| Optional eval gate | `harness-pr-eval-required` ruleset | Requires eval-ci jobs on PRs to `main` |
| Change size / retry policy | [docs/operations.md](docs/operations.md) | Canonical thresholds (optional `DIFF_SIZE_L1_HARD_FAIL`) |
| Optional telemetry | GitHub Secrets `LANGFUSE_*` | Trace links and KPI export ([infra/README.md](infra/README.md)) |

Run `./scripts/setup-wizard.mjs` to apply the required install settings interactively. Non-interactive example:

```bash
./scripts/setup-wizard.mjs --yes --stack ts --codeowners @your-org/harness-engineers
./scripts/setup-wizard.mjs --template --yes --stack ts
```

**Template repo note:** When dogfooding this repository itself, run the wizard with `--template`. It writes gitignored `.harness-stack` and syncs GitHub rulesets, but **does not** replace the committed CODEOWNERS placeholder unless you pass `--patch-codeowners`. Use a separate product repository (or fork) when you need real code-owner enforcement with committed owners.

## Start Spec-Driven L1 Flow

To run autonomous implementation from a spec (CC-SD contract) without guesswork:

1. Prepare repository settings with `./scripts/setup-wizard.mjs`
2. Verify L1 readiness:

```bash
npm run check-l1-readiness
npm run check-l1-readiness -- --strict
```

3. Create an Issue from `.github/ISSUE_TEMPLATE/task.yml`
4. Fill `Goal`, `Non-goals`, `Constraints`, `Acceptance criteria`, `Rollback hints`
5. Confirm the synced labels (`task:docs` or `task:test-fix`) + `autonomy:L1`
6. Assign `triager`, then `implementer`

Readiness checker notes:

- validates local harness assets and doctor checks
- validates GitHub labels/rulesets and latest `copilot-setup-steps` run when `gh` is authenticated
- reports items that still require manual confirmation (Copilot coding agent entitlement)
- supports machine-readable output via `npm run check-l1-readiness -- --json`
- without local Node/gh, run **Actions → L1 readiness check → Run workflow** via [.github/workflows/l1-readiness-check.yml](.github/workflows/l1-readiness-check.yml) (writes a job summary)

Bootstrap merges harness npm scripts into an existing root `package.json` instead of overwriting application metadata. Non-Node stacks get a minimal harness-only `package.json` when none exists.

Fresh clones without gitignored `.harness-stack` infer stack from the committed `product-ci-*.yml` workflow.

Detailed trial guide: [docs/coding-agent-l1.md](docs/coding-agent-l1.md).

## Repository layout

```text
sdlc-gh/
├── AGENTS.md                # project instructions for agents (task classes, roles)
├── config/
│   └── stacks.json          # stack catalog (profile, marker, workflow mapping)
├── .github/
│   ├── copilot-instructions.md  # global agent policy
│   ├── instructions/        # per-path and per-stack conventions
│   ├── agents/              # triager / implementer / reviewer (least privilege)
│   ├── skills/              # verification procedure skill (quality-loop)
│   ├── hooks/               # destructive-command blocklist
│   ├── workflows/           # walls (harness-ci, product-ci-*), evals, retry, sync
│   ├── labels.yml           # task:* / autonomy:* label definitions
│   └── ruleset.example.json # branch protection example
├── docs/                    # architecture and operations docs (see below)
├── evals/                   # convention tests, rubric, e2e bench definitions
├── prompts/                 # prompts for gh models eval
├── scripts/                 # CI gate implementations, bootstrap, drift report
├── sample/                  # minimal ts / python / go / ruby / php samples (product CI targets)
└── infra/                   # optional Langfuse / OTel scaffolding
```

Inside this template, sample code lives under `sample/{stack}/` and all product CI workflows run when the corresponding marker file exists. In a bootstrapped product repository, only your selected stack's product CI workflow is copied and it targets the repository root.

## How a task flows

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Issue as Issue
    participant Tri as triager
    participant Imp as implementer
    participant Wall as Walls (CI)
    participant Eval as eval-ci
    participant Rev as Reviewer

    Dev->>Issue: CC-SD contract (L1 docs / test-fix)
    Issue->>Tri: Classify task:* / autonomy:*
    Tri->>Imp: Delegate (complete contract required)
    Imp->>Wall: Draft PR
    alt CI failure
        Wall-->>Imp: Retry orchestrator (max 3)
    else CI pass
        Wall->>Eval: Harness asset changes only
        Wall->>Rev: PR context comment
        Rev->>Issue: Approve or request changes
    end
```

For `task:docs` and `task:test-fix` at `autonomy:L1`, the Issue embeds a lightweight CC-SD contract (`Goal`, `Non-goals`, `Constraints`, `Acceptance criteria`, `Rollback hints`). v1 does not cover `feature-small` or higher-risk classes. Details: [docs/coding-agent-l1.md](docs/coding-agent-l1.md).

On CI failure, `agent-retry-orchestrator` applies retry labels (max 3 attempts; stops after the same failure signature twice; security failures escalate immediately). Canonical thresholds live in [docs/operations.md](docs/operations.md).

## Local checks

Run from the repository root:

```bash
npm run validate          # harness asset consistency
npm run test-hooks        # hook block/allow scenarios
npm run test-issue-spec   # CC-SD issue-spec validator scenarios
npm run test-diff-size    # diff-size / autonomy gate scenarios
npm run test-e2e-manifest # e2e manifest structural checks
npm run test-setup-github # ruleset payload builder scenarios
npm run test-doctor       # doctor local check scenarios
npm run check-e2e         # e2e bench manifest checks
npm run run-e2e           # e2e bench executable acceptance checks
npm run verify-bootstrap  # bootstrap integration test (all stacks)
npm run check             # full local gate (validate + scenarios + e2e)
```

On Node.js versions older than 22, `run-e2e-bench.mjs` may skip verifiers that require the same runtime as CI and report them as skipped rather than failed.

Convention tests in Python:

```bash
pip install pytest
pytest evals/trajectories -q
```

## Phased rollout

Don't enable everything at once. Canonical phase definitions (including Phase 0 baseline) are in [docs/arch.md](docs/arch.md) §7. This table is the quick path; details in [docs/adoption.md](docs/adoption.md).

| Phase | Enable | Risk |
|-------|--------|------|
| 0 | CI walls, rulesets (`setup-github.sh`), optional Langfuse scaffold | Low |
| 1 | instructions, agents, hooks, templates | Low |
| 2 | `harness-ci` + your stack's `product-ci` | Medium |
| 3 | `eval-ci` + optional eval ruleset | Medium |
| 4 | coding agent L1 (`task:docs` / `task:test-fix` only) | Low–Medium |

Getting started with L1 delegation: [docs/coding-agent-l1.md](docs/coding-agent-l1.md).

## Project status

Functional today: bootstrap, harness/product CI, diff-size and autonomy gates, hooks scenarios, retry orchestrator, PR context comments, executable acceptance-style E2E checks (9 tasks), and eval scaffolding.

Known placeholders (aligned with [docs/arch.md](docs/arch.md) implementation status):

| Area | Status |
|------|--------|
| Bootstrap, stack catalog, harness/product CI | **Implemented** |
| Hooks, diff-size gate, CC-SD issue-spec check | **Implemented** |
| Custom agents (triager / implementer / reviewer) | **Implemented** |
| Eval CI with change-type job selection | **Implemented** |
| Retry orchestrator, PR context comments | **Implemented** |
| E2E bench (executable acceptance checks) | **Partial** — 9 tasks; not yet break-and-fix agent runner |
| `gh models eval` in CI | **Scaffolded** — runs when prompts exist; org must enable Models |
| gh-aw outer loop (`nightly-harness-review`, `weekly-redteam`) | **Partial** — GHA outer loop + gh-aw dogfood CI (#7); `.md`/`.lock.yml` stubs remain |
| Langfuse / OTel export | **Scaffolded** — `infra/` + schema; wiring optional |

### Observability placeholders (spec only)

Until Langfuse / OTel is wired, PR context comments use fixed placeholders (workflow logic unchanged):

| Field | When unset / n/a |
|-------|------------------|
| Trace link | `_configure LANGFUSE_HOST; then search by repo=…, pr_number=…_` |
| AI credits | Informational — `_set max-ai-credits in org settings_` |
| Threat detection | `n/a` — gh-aw outer loop remains stub |

Validate sample payloads: `node scripts/validate-telemetry.mjs "$(cat infra/samples/telemetry-payload.json)"` and `node scripts/validate-telemetry.mjs "$(cat infra/samples/telemetry-artifact.json)"`. Inner-loop workflows emit artifacts per [docs/telemetry-artifacts.md](docs/telemetry-artifacts.md); field definitions in [docs/telemetry-schema.md](docs/telemetry-schema.md).

## Architecture

The harness is a **dual-loop control system**: a fast inner loop (agent + deterministic walls) and a slower outer loop (eval + harness revision).

```mermaid
flowchart LR
    subgraph OUTER["Outer loop (daily–weekly)"]
        EVAL[Eval / traces]
        REVISE[Revise instructions / walls]
    end
    subgraph INNER["Inner loop (per task)"]
        FF[Feed-forward<br/>instructions / agents / skills]
        AGENT[Agent<br/>plan → act → test]
        WALL[Walls<br/>CI / hooks / diff-size]
    end
    Issue[Issue + CC-SD] --> FF
    FF --> AGENT --> WALL
    WALL -- fail --> AGENT
    WALL -- pass --> PR[Draft PR]
    AGENT -.-> EVAL
    PR -.-> EVAL
    EVAL --> REVISE
    REVISE --> FF
```

Layers as implemented in this repo (details in [docs/arch.md](docs/arch.md)):

```mermaid
flowchart TB
    L0[L0 Governance<br/>rulesets · CODEOWNERS · labels]
    L1[L1 Feed-forward<br/>instructions · agents · skills]
    L2[L2 Execution<br/>coding agent · CLI · gh-aw stubs]
    L3[L3 Walls<br/>harness-ci · product-ci · hooks]
    L4[L4–L6 Observability · Eval · Outer loop<br/>Langfuse · eval-ci · nightly review stubs]
    L0 --> L1 --> L2 --> L3 --> L4
    L4 -. revise .-> L1
```

## Documentation

If you are adopting the harness in a product repo, start with [docs/adoption.md](docs/adoption.md) and then keep [docs/revert-playbook.md](docs/revert-playbook.md) nearby.

If you are operating an installed harness day to day, read [docs/operations.md](docs/operations.md) first, then [docs/failure-taxonomy.md](docs/failure-taxonomy.md) and [docs/telemetry-artifacts.md](docs/telemetry-artifacts.md).

If you are writing or triaging Task Issues for L1 delegation, start with [docs/coding-agent-l1.md](docs/coding-agent-l1.md) and use the Actions fallback in [.github/workflows/l1-readiness-check.yml](.github/workflows/l1-readiness-check.yml) when local `gh`/Node is unavailable.

If you are contributing to the harness itself, read [CONTRIBUTING.md](CONTRIBUTING.md), then [docs/arch.md](docs/arch.md), and use [docs/shared-config.md](docs/shared-config.md) for distribution/update strategy.

| Document | Contents |
|----------|----------|
| [docs/arch.md](docs/arch.md) | Full architecture and design principles |
| [docs/adoption.md](docs/adoption.md) | Installation and rollback |
| [docs/operations.md](docs/operations.md) | Thresholds, retry policy, forbidden ops (**canonical** policy) |
| [docs/revert-playbook.md](docs/revert-playbook.md) | Revert procedure (harness vs product) |
| [docs/coding-agent-l1.md](docs/coding-agent-l1.md) | Running the first L1 delegations |
| [docs/failure-taxonomy.md](docs/failure-taxonomy.md) | Classifying failures for outer-loop routing |
| [docs/kpi-baseline.md](docs/kpi-baseline.md) | Weekly KPI tracking template |
| [docs/telemetry-schema.md](docs/telemetry-schema.md) | Required observability fields |
| [docs/telemetry-artifacts.md](docs/telemetry-artifacts.md) | Inner-loop JSON artifact format and storage |
| [docs/gh-aw-dogfood.md](docs/gh-aw-dogfood.md) | Bounded gh-aw validation on sdlc-gh |
| [docs/auth-boundaries.md](docs/auth-boundaries.md) | Credential boundaries per execution mode |
| [docs/publishing.md](docs/publishing.md) | npm package release (`@guilz-dev/sdlc-gh`) |
| [docs/shared-config.md](docs/shared-config.md) | Distributing shared assets across repositories |
| [docs/exceptions/README.md](docs/exceptions/README.md) | Recording policy exceptions |
| [infra/README.md](infra/README.md) | Self-hosting Langfuse / OTel |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow and review expectations |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting policy |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community behavior expectations |
| [SUPPORT.md](SUPPORT.md) | Support routes and troubleshooting intake |

## FAQ

**Q. How do I pull template updates into a repository that already uses the harness?**
A. Re-run `bootstrap-harness.sh` to overwrite harness assets, then review the diff with `npm run drift-report`. The `harness-sync` workflow produces a weekly drift report.

**Q. Does the harness itself need a test framework (Jest etc.)?**
A. No. The harness is guarded by the `scripts/*.mjs` checks and `eval-ci`. Your application keeps its own test runner (vitest / pytest / go test / rspec / phpunit).

## Project policies

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Support: [SUPPORT.md](SUPPORT.md)

## License

[MIT](LICENSE)
