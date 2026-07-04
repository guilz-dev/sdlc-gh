---
description: Nightly harness review — classify failures and propose harness revisions.
name: Nightly harness review
on:
  schedule:
    - cron: "0 2 * * *"
permissions:
  contents: read
safe-outputs:
  create-pull-request:
    max: 1
---

Analyze failure traces per docs/failure-taxonomy.md.

When drift is detected, propose a harness revision (instructions/skills eval diff).
