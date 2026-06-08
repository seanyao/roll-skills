---
name: roll-loop
license: MIT
allowed-tools: "Read, Glob, Grep, Write, Edit, Bash(git:*), Bash(cat:*), Skill"
description: "Load when configuring, explaining, or operating Roll autonomous backlog execution loop that scans Todo work and dispatches US/FIX/REFACTOR items."
---
# Roll Loop

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when configuring, explaining, or operating Roll autonomous backlog execution loop that scans Todo work and dispatches US/FIX/REFACTOR items.

## When Not to Use

- One-shot story execution by a human agent; load roll-build or roll-fix.
- Nightly architecture scan; load roll-.dream.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Scan BACKLOG for Todo items.
2. Route US/FIX/REFACTOR to the right skill.
3. Run bounded cycles with fresh context.
4. Persist events, runs, alerts, and status.
5. Pause on repeated failure.

## Hard Gates

- Loop never cuts a release autonomously.
- Fail-loud and PAUSE beat silent fallback.

## Gotchas

- Loop dispatches backlog items; it must not merge releases or bypass human-on-the-loop decisions.
- Fail-loud pause behavior is preferable to silent fallback when repeated execution breaks.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
