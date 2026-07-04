---
name: quality-loop
description: Verify changes against acceptance criteria before marking complete. Use when implementing or reviewing tasks.
---

# Quality loop

1. Read Issue acceptance criteria.
2. Implement minimal change within autonomy limits.
3. Run stack tests and harness CI locally if possible.
4. If checks fail, fix and retry (max per docs/operations.md).
5. Update PR harness context table.
6. Stop when all criteria are met or escalate on repeated failure.

## References

- docs/operations.md — thresholds and retry policy
- docs/failure-taxonomy.md — classify failures
