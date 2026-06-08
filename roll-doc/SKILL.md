---
name: roll-doc
license: MIT
allowed-tools: "Read, Write, Edit, Glob, Grep, Bash(date:*,find:*,stat:*,wc:*)"
description: "Load when a project needs documentation inventory, docs/INDEX generation, undocumented module detection, or draft documentation fills for existing code."
---
# Roll Doc

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a project needs documentation inventory, docs/INDEX generation, undocumented module detection, or draft documentation fills for existing code.

## When Not to Use

- Presentation deck generation; load roll-deck.
- Toolchain diagnosis; load roll-doctor.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Scan documentation and code surfaces.
2. Generate or update docs/INDEX.md.
3. Identify undocumented modules.
4. Draft fills from code evidence.

## Hard Gates

- Do not invent behavior without source evidence.
- Keep docs linked and indexable.

## Gotchas

- Draft missing docs from current code evidence; do not hallucinate module behavior from filenames alone.
- Documentation inventory is not a product deck or owner brief.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
