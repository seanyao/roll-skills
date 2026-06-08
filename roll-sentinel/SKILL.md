---
name: roll-sentinel
license: MIT
allowed-tools: "Read, Edit, Write, Bash, WebFetch"
description: "Load when production or deployed behavior needs cost-controlled randomized patrol checks based on backlog requirements and runtime sampling."
---
# Roll Sentinel

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when production or deployed behavior needs cost-controlled randomized patrol checks based on backlog requirements and runtime sampling.

## When Not to Use

- Code health scans; load roll-.dream.
- Interactive page debugging; load roll-debug.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Select sampling targets from backlog requirements.
2. Run randomized cost-controlled checks.
3. Validate observed production behavior.
4. Record patrol evidence and escalate anomalies.

## Hard Gates

- Sampling budget remains explicit.
- Do not turn sentinel into exhaustive monitoring.

## Gotchas

- Sentinel samples deployed behavior; it is not a code architecture scanner.
- Keep cost controls and randomized sampling visible; do not turn patrols into exhaustive monitoring.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
