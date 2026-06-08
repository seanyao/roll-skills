---
name: roll-build
license: MIT
allowed-tools: "Read, Edit, Write, Glob, Grep, Bash, Skill, Agent"
description: "Load when a user gives a US-XXX story or asks to ship a feature through Roll TCR delivery, from clarification through verification and backlog write-back."
---
# Roll Build

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a user gives a US-XXX story or asks to ship a feature through Roll TCR delivery, from clarification through verification and backlog write-back.

## When Not to Use

- Pure design or backlog splitting without code; load roll-design.
- Narrow FIX/BUG repair; load roll-fix.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Classify input as Story mode or Fly mode.
2. Read backlog/spec and decide if the story fits one cycle.
3. Split into small TCR actions and define verification.
4. Run test-first implementation, self-review, evidence, and write-back.
5. Commit on green, open PR, and leave remote evidence.

## Hard Gates

- TCR for every micro-step.
- No WIP commits or bypassed verification.
- Self-review, attest, E2E evidence, and self-score remain required.

## Gotchas

- Do not use for pure design/backlog splitting; route that to roll-design until implementation starts.
- TCR and evidence gates remain mandatory even when the code change looks small.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
