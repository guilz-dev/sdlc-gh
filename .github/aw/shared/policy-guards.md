# Policy guards (gh-aw shared fragment)

Import from gh-aw workflow frontmatter via `imports:`.

## Trigger roles

- Default: `admin`, `maintainer`, `write` only
- Do not broaden without updating [docs/auth-boundaries.md](../../docs/auth-boundaries.md)

## Safe-output defaults

- Prefer `max: 1` for `create-pull-request` and `create-agent-session`
- Issue creation for outer-loop routing stays in **GHA scripts** unless explicitly promoted
- No merge-related safe-outputs

## Cost and lifetime

- Declare `max-ai-credits` in every workflow frontmatter
- Use `on.stop-after` for scheduled workflows after promotion
- Until promotion: **`workflow_dispatch` only** on gh-aw `.md` sources

## Network

- `network: {}` when no external fetch is required
- Add domains explicitly; do not use unrestricted egress on public repos
