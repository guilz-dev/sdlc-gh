# Optional shared config repository

For organizations with multiple product repos, use a **shared config repo** to distribute common agents and skills.

## Layout

```text
org-harness-shared/
├── .github/
│   └── agents/
│   └── skills/
└── README.md
```

## Distribution options

1. **Manual copy** — periodic sync of `agents/` and `skills/` into product repos
2. **Subtree** — `git subtree pull` from shared repo into `.github/`
3. **harness-sync.yml** — extend with `TARGET_REPO` matrix for each product repo

## Conflict resolution

Product repo local overrides win for repo-specific instructions. Shared repo provides defaults only.

## When to use

- 3+ product repositories on the same harness template version
- Identical triager/implementer/reviewer definitions across teams

See [adoption.md](adoption.md) for bootstrap and sync procedures.
