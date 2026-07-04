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

## Quick start

Requirements: a GitHub repository with Actions enabled; Node.js 18+ for basic local checks. Use Node.js 22 for full parity with CI, including all executable E2E verifiers.

**Option A — new repository from template (easiest)**

Click **Use this template** on GitHub, delete the `sample/` stacks you don't need, and add your code.

**Option B — add the harness to an existing repository**

```bash
git clone https://github.com/YOUR_ORG/sdlc-gh.git /tmp/sdlc-gh

# stack: ts | python | go | ruby | php
/tmp/sdlc-gh/scripts/bootstrap-harness.sh \
  --repo /path/to/your-product \
  --stack python \
  --mode existing

cd /path/to/your-product
git add -A && git commit -m "Add agent harness from sdlc-gh"
```

**Option C — start a brand-new product**

```bash
/tmp/sdlc-gh/scripts/bootstrap-harness.sh \
  --repo /path/to/new-product --stack ts --mode new
```

`--mode new` expands the minimal `sample/{stack}/` project into the repository root.

### After installing (required)

The harness is inert until you complete these steps:

1. **Sync labels** — run the `Sync labels` workflow once. The `task:*` / `autonomy:*` labels drive the diff-size gate
2. **Protect the branch** — import [.github/ruleset.example.json](.github/ruleset.example.json) under *Settings → Rules*, making `harness-static`, `diff-size`, `issue-spec-check`, and your stack's product CI required checks (`issue-spec-check` always passes for non-L1 PRs; it enforces CC-SD only when the linked Issue has `task:docs` or `task:test-fix` and `autonomy:L1` labels)
3. **Set CODEOWNERS** — replace `@your-org/harness-engineers` in [.github/CODEOWNERS](.github/CODEOWNERS) with a real team
4. **Run the local checks** — see "Local checks" below to confirm your environment

Detailed steps and rollback guidance: [docs/adoption.md](docs/adoption.md).

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
npm run check-e2e         # e2e bench manifest checks
npm run verify-bootstrap  # bootstrap integration test (all stacks)
```

On Node.js versions older than 22, `run-e2e-bench.mjs` may skip verifiers that require the same runtime as CI and report them as skipped rather than failed.

Convention tests in Python:

```bash
pip install pytest
pytest evals/trajectories -q
```

## Phased rollout

Don't enable everything at once. This order is the safe path; details in [docs/adoption.md](docs/adoption.md).

| Phase | Enable | Risk |
|-------|--------|------|
| 1 | instructions, agents, hooks, templates | Low |
| 2 | `harness-ci` + your stack's `product-ci` | Medium |
| 3 | `eval-ci` + eval-required ruleset | Medium |
| 4 | coding agent L1 (`task:docs` / `task:test-fix` only) | Low–Medium |

Getting started with L1 delegation: [docs/coding-agent-l1.md](docs/coding-agent-l1.md).

## Project status

Functional today: bootstrap, harness/product CI, diff-size and autonomy gates, hooks scenarios, retry orchestrator, PR context comments, executable acceptance-style E2E checks, and eval scaffolding.

Known placeholders:

- `nightly-harness-review` / `weekly-redteam` (gh-aw workflows) are **Phase 3 stubs** — they document intent and safe-output limits but do not yet compile with `gh aw compile`
- `run-e2e-bench.mjs` validates executable acceptance checks for task fixtures, but it is not yet a full break-and-fix agent benchmark
- `gh models eval` steps in Eval CI are non-blocking until GitHub Models is enabled for your organization

## Documentation

| Document | Contents |
|----------|----------|
| [docs/arch.md](docs/arch.md) | Full architecture and design principles |
| [docs/adoption.md](docs/adoption.md) | Installation and rollback |
| [docs/operations.md](docs/operations.md) | Thresholds, retry policy, forbidden ops (**canonical** policy) |
| [docs/coding-agent-l1.md](docs/coding-agent-l1.md) | Running the first L1 delegations |
| [docs/failure-taxonomy.md](docs/failure-taxonomy.md) | Classifying failures for outer-loop routing |
| [docs/kpi-baseline.md](docs/kpi-baseline.md) | Weekly KPI tracking template |
| [docs/telemetry-schema.md](docs/telemetry-schema.md) | Required observability fields |
| [docs/auth-boundaries.md](docs/auth-boundaries.md) | Credential boundaries per execution mode |
| [docs/shared-config.md](docs/shared-config.md) | Distributing shared assets across repositories |
| [docs/exceptions/README.md](docs/exceptions/README.md) | Recording policy exceptions |
| [infra/README.md](infra/README.md) | Self-hosting Langfuse / OTel |

## FAQ

**Q. How do I pull template updates into a repository that already uses the harness?**
A. Re-run `bootstrap-harness.sh` to overwrite harness assets, then review the diff with `npm run drift-report`. The `harness-sync` workflow produces a weekly drift report.

**Q. Does the harness itself need a test framework (Jest etc.)?**
A. No. The harness is guarded by the `scripts/*.mjs` checks and `eval-ci`. Your application keeps its own test runner (vitest / pytest / go test / rspec / phpunit).

## Contributing

Issues and PRs are welcome. Note that this repository applies its own rules to itself:

- Changes to harness assets (`.github/**`, `evals/**`, `prompts/**`) trigger Eval CI and require harness-engineer review via CODEOWNERS
- Keep PRs within the autonomy size limits in [docs/operations.md](docs/operations.md)

## License

[MIT](LICENSE)
