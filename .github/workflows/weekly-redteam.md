---
description: Weekly red team probe suite (garak).
name: Weekly red team
on:
  schedule:
    - cron: "0 3 * * 0"
permissions:
  contents: read
safe-outputs:
  noop:
---

Run the garak probe suite and report results to the morning queue. Do not auto-merge.
