---
name: roll-design
license: MIT
allowed-tools: "Read, Edit, Write, Glob, Grep, Bash(git:*), WebSearch, WebFetch, Skill"
description: "Load when the user wants to discuss approaches, design a solution, model domains, split work into INVEST stories, or write backlog/spec artifacts without coding."
---
# Roll Design

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when the user wants to discuss approaches, design a solution, model domains, split work into INVEST stories, or write backlog/spec artifacts without coding.

## When Not to Use

- Existing US implementation; load roll-build.
- Narrow bug repair; load roll-fix.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Read [engineering checklist](references/engineering-checklist.md) when validating design output quality.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Clarify only when intent or boundaries are unclear.
2. Model domain depth proportional to risk and novelty.
3. Split into INVEST stories with acceptance criteria and dependencies.
4. Write specs through roll story new and update backlog.
5. Self-score the design quality.

## Hard Gates

- Do not start implementation from this skill.
- Backlog rows and spec files must stay consistent.
- Peer review gates apply only when explicitly available/requested.

## Gotchas

- Design writes backlog/spec artifacts; it must not quietly start code implementation.
- Use roll story new for story directories; do not hand-create backlog rows without matching dossier structure.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
