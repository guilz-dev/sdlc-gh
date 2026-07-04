# Auth Boundaries

Execution mode credential matrix (arch.md §4.2).

| Mode | Credentials | Scope | Audit |
|------|-------------|-------|-------|
| CLI / IDE | Developer local delegation | User's local permissions | Copilot audit logs |
| coding agent | Short-lived, repo-scoped token | Isolated VM, own branch only, cannot approve own PR | Actions + OTel |
| gh-aw | Secretless; proxy/gateway auth | AWF firewall, domain allowlist | gh aw audit, firewall logs |
| SDK | Proxy execution service | Limited operations only | Application audit log |

## Invariants

- No long-lived secrets in prompt context or agent-readable files
- Production credentials never in harness assets committed to git
- Exceptions require documented approval in `docs/exceptions/`
