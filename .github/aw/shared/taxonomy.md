# Failure taxonomy (gh-aw shared fragment)

Align agent outputs with [docs/failure-taxonomy.md](../../docs/failure-taxonomy.md).

## Harness outer loop (Loop A)

| Class | Signal | Routed label |
|-------|--------|--------------|
| **FF不足** | Repeated lint / convention gaps | `outer-loop:harness-revision` |
| **壁不足** | CI green + review rejects | `outer-loop:wall-addition` |
| **モデル限界** | Retry exhaustion, security walls | Escalate / human |

## Code review outer loop (Loop B — planned)

| Category | Typical task | Autonomy |
|----------|--------------|----------|
| test-gap | `task:test-fix` | L1 |
| bug-risk (small) | `task:test-fix` | L1 |
| security | `task:security-sensitive` | L0 |
| maintainability | `task:refactor` | L0 |

Agents must emit machine-readable categories matching routing scripts, not free-form prose only.
