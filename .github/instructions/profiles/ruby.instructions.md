---
description: Ruby conventions
applyTo: "**/*.{rb,rake,Gemfile,Gemfile.lock}"
---

# Ruby profile

- Follow project style; use RuboCop for lint.
- Tests with RSpec in `spec/`.
- Use Bundler; commit `Gemfile.lock` when the project locks dependencies.
- Prefer explicit requires or Zeitwerk-style autoloading per project layout.
