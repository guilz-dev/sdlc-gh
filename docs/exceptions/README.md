# Exception ledger

Record deviations from harness principles (arch.md §9). Every exception is time-boxed and must include a revert plan.

## Required fields

Every exception record **must** include all of the following:

| Field | Requirement |
|-------|-------------|
| **Reason** | Why the deviation is needed |
| **Target task / PR** | Issue or PR link |
| **Principle deviated** | Which harness principle is waived (e.g. Principle 4 — no harness change without eval) |
| **Approver** | Named human approver (not the agent) |
| **Expiry** | Max **14 days** from approval; no permanent exceptions |
| **Revert plan** | Concrete steps to undo if the exception causes regression |

## Template

Copy [TEMPLATE.md](TEMPLATE.md) when recording an exception. Exceptions appear in the next morning queue for post-review.

## Related docs

- Revert procedure: [revert-playbook.md](../revert-playbook.md)
- Morning queue: [operations.md](../operations.md)
