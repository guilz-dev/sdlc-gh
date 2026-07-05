# npm publish

The harness installer is published as **`@guilz-dev/sdlc-gh`**.

## Install (adopters)

```bash
cd /path/to/your-product
npx @guilz-dev/sdlc-gh
```

Pin a version:

```bash
npx @guilz-dev/sdlc-gh@0.1.0 init --yes --stack ts --codeowners @your-org/harness-engineers
```

Before the first npm release, use GitHub:

```bash
npx github:guilz-dev/sdlc-gh
```

## Prerequisites (maintainers)

1. npm org **`@guilz-dev`** exists and your user can publish to it  
   - https://www.npmjs.com/org/create  
   - `npm org ls guilz-dev`
2. Granular npm access token with **Publish** for `@guilz-dev/sdlc-gh`
3. GitHub repository secret **`NPM_TOKEN`** (repo → Settings → Secrets → Actions)

Enable **Trusted Publishing** (recommended) or use a classic token with publish scope.

## Release flow

1. Bump `version` in `package.json` (semver).
2. Merge to `main`.
3. Create a GitHub **Release** whose tag matches the version (`0.1.0` or `v0.1.0`; workflow strips optional `v`).
4. Workflow **npm publish** runs on `release: published` and publishes with provenance.

Manual dry run (no publish):

```bash
gh workflow run npm-publish.yml
```

Publish happens **only** on GitHub Release (`release: published`). The manual workflow runs validation and `npm publish --dry-run` only.

Local dry run:

```bash
npm pack --dry-run
npm publish --dry-run --access public
```

## prepack / prepublishOnly

- **`prepack`**: `validate` + `test-sdlc-gh-cli` (runs on `npm pack` / `npm publish`)
- **`NPM_PACKAGE_FILES`** in `scripts/lib/npm-package.mjs` must stay in sync with `package.json` `files` (enforced by `validate-harness.mjs`)
- **`prepublishOnly`**: `check-e2e` (manifest checks only; full bench is CI)

## Package contents

Controlled by `files` in `package.json` and `.npmignore`. Sample stacks ship **source only** (no `node_modules` / `vendor`); adopters run `npm install` / `composer install` in the product repo after `--mode new` bootstrap.

## Rollback

Unpublish is discouraged on npm. Ship a patch release instead:

```bash
npm version patch
# release + publish 0.1.1
```

If a bad tarball must be deprecated:

```bash
npm deprecate @guilz-dev/sdlc-gh@0.1.0 "Use >=0.1.1"
```
