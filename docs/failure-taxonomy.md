# Failure Taxonomy

Classify failures for outer-loop routing (arch.md §5.3).

## Categories

| Class | Definition | Remediation |
|-------|------------|-------------|
| **FF不足** (feed-forward gap) | Repeated convention violations, missed steps | Update instructions / skills / agents |
| **壁不足** (wall gap) | CI passes but human review rejects | Add tests, lint rules, contracts |
| **モデル限界** (model limit) | Correct tools and context, still fails after N retries | Escalate, split task, or accept human-led |

## Wall failure types

`test` | `lint` | `type` | `security` | `safe-output` | `diff-size`

## Routing

1. Auto-retry inner loop (where allowed per `docs/operations.md`)
2. Structured comment on PR with `wall_failure_type`
3. Weekly aggregate in morning queue
4. Repeated FF不足 → harness revision Issue
