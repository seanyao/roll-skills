---
hidden: true
name: roll-.dream
license: MIT
allowed-tools: "Read, Glob, Grep, Bash(git:*, curl:*, claude:*), Write, Edit"
description: "Load when a scheduled or manual nightly architecture health scan should inspect code structure, dead code, doc staleness, and refactor candidates."
---
# Roll Dream

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a scheduled or manual nightly architecture health scan should inspect code structure, dead code, doc staleness, and refactor candidates.

## When Not to Use

- Runtime patrols; load roll-sentinel.
- Local web debugging; load roll-debug.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Scan structure, dead code, drift, and docs.
2. Classify findings as refactor/doc candidates.
3. Write daily dream log and backlog candidates.
4. Keep recommendations human-reviewed.

## Hard Gates

- Do not auto-activate scored findings.
- Fail loud if the dream skill or project context is missing.

## Gotchas

- Dream reviews code and architecture health, not live production behavior; use roll-sentinel for runtime patrols.
- Findings become human-reviewed backlog candidates; do not auto-activate refactors from scoring signals.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
