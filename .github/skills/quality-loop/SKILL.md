---
name: quality-loop
description: Verify changes against acceptance criteria before marking complete. Use when implementing or reviewing tasks.
---

# Quality loop

1. Read Issue CC-SD contract: `Goal`, `Non-goals`, `Constraints`, `Acceptance criteria`, `Rollback hints`.
2. Implement minimal change within autonomy limits and non-goals.
3. Run stack tests and harness CI locally if possible.
4. If checks fail, fix and retry (max per docs/operations.md).
5. Update PR with contract summary fields and harness context table.
6. Before marking complete, re-check:
   - all `Acceptance criteria` satisfied
   - `Non-goals` were not violated
   - `Constraints` were respected
   - `Rollback hints` remain plausible
7. Stop when all criteria are met or escalate on repeated failure.

## References

- docs/operations.md — thresholds and retry policy
- docs/failure-taxonomy.md — classify failures
