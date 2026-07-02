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

## Operating Modes

Used in **guided** mode when the owner explicitly starts a FIX/BUG repair, and
in **autonomous** mode when the loop scheduler dispatches an eligible FIX/BUG
item. The same regression, evidence, Evaluator, and release gates apply in both
modes.

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
- The Review Score is produced by the runner's fresh-session peer Reviewer — the agent does NOT self-score.
- Docs/code/product alignment is a DoD gate: user-visible behavior, command, output-copy, site, or delivery-view changes update the touched README/docs/guide/site/help in the same delivery.

## Gotchas

- Use for narrow FIX/BUG work; broad feature delivery belongs in roll-build.
- Never patch without a regression signal or explicit reason why the bug cannot be reproduced locally.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.

## Role in v4 execution profiles

**roll-fix is the Builder capability for hot-fix scope** (a single issue), normally under the `standard` execution profile — the same TCR/test/attest flow as roll-build, with no Designer or Evaluator. A fix that turns out user-visible or evidence-risky is selected into `verified`; one that turns out cross-module or ambiguous into `designed`. Roles: Supervisor / Designer / Builder / Evaluator.
