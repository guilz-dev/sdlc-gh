# Security Policy

## Supported scope

This repository contains workflow templates, hooks, agent instructions, eval fixtures, and operational policy for AI coding agents. Security reports are especially relevant when they affect:

- destructive command blocking
- workflow or ruleset bypass
- privilege escalation across agent roles
- secret handling or credential boundaries
- unsafe bootstrap or sync behavior

## Reporting a vulnerability

Please do not report security issues in public GitHub Issues or PRs.

Instead, contact the maintainers privately with:

- a clear description of the issue
- affected files or workflows
- reproduction steps or proof of concept
- impact assessment
- any suggested mitigation

If you already know the appropriate maintainer or team for this repository, contact them directly. If not, open a minimal public Issue that only asks for a private contact path and do not include exploit details.

## Disclosure expectations

- We will acknowledge receipt
- We will validate the report and assess impact
- We may ask for clarification or a reduced proof of concept
- We prefer coordinated disclosure after a fix or mitigation is available

## Out of scope

The following are generally out of scope unless they create a concrete bypass or unsafe behavior in this repository:

- theoretical prompt attacks without a reproducible harness impact
- issues in third-party hosted services not controlled by this project
- unsupported local modifications to downstream product repositories

## Operational note

Some controls in this project are intentionally defense-in-depth rather than absolute containment. Reports that show a reliable bypass of documented guardrails are still valuable even when another layer also exists.
