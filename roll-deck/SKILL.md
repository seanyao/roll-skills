---
name: roll-deck
license: MIT
allowed-tools: "Read, Edit, Write, Glob, Grep, Bash(git:*)"
description: "Load when the user asks Roll to create a bilingual presentation deck or deck.md from a topic, project context, backlog evidence, or feature narrative."
---
# Roll Deck

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when the user asks Roll to create a bilingual presentation deck or deck.md from a topic, project context, backlog evidence, or feature narrative.

## When Not to Use

- Project docs inventory; load roll-doc.
- Release changelog; load roll-.changelog.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Read project context and agree outline when needed.
2. Write .roll/slides/<slug>/deck.md.
3. Use bilingual title/body fields and evidence per slide.
4. Leave HTML rendering to roll slides build.

## Hard Gates

- 18-slide deck shape stays fixed unless user says otherwise.
- Every slide carries evidence.

## Gotchas

- Deck output is .roll/slides/<slug>/deck.md only; rendering is a separate roll slides build step.
- Every slide needs evidence from project context; do not produce generic marketing copy without file-backed support.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
