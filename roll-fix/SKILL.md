---
name: roll-fix
license: MIT
allowed-tools: "Read, Edit, Write, Glob, Grep, Bash, Skill"
description: "Load when the user provides a FIX-XXX or BUG-XXX item, or asks for a focused hotfix/bugfix through Roll lighter TCR repair workflow."
---
# Roll Fix

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when the user provides a FIX-XXX or BUG-XXX item, or asks for a focused hotfix/bugfix through Roll lighter TCR repair workflow.

## When Not to Use

- Broad feature delivery; load roll-build.
- Discussion-only design work; load roll-design.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Read the FIX/BUG row and root-cause context.
2. Reproduce or explain why reproduction is impossible.
3. Add the failing/regression test first.
4. Patch through TCR, run focused and local CI checks.
5. Self-review, update backlog/evidence, and open PR.

## Hard Gates

- Every fix gets a regression signal or documented exception.
- Blocking review findings are fixed in another TCR cycle.
- Self-score note is required before exit.

## Gotchas

- Use for narrow FIX/BUG work; broad feature delivery belongs in roll-build.
- Never patch without a regression signal or explicit reason why the bug cannot be reproduced locally.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
