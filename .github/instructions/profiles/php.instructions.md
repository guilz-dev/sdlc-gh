---
description: PHP conventions
applyTo: "**/*.{php,composer.json,composer.lock}"
---

# PHP profile

- Follow PSR-12; use PHP_CodeSniffer or project linter.
- Tests with PHPUnit in `tests/`.
- Use Composer; commit `composer.lock` when the project locks dependencies.
- Type-hint public methods where supported by the project's PHP version.
