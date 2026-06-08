---
hidden: true
name: roll-.qa
license: MIT
allowed-tools: "Read"
description: "Load when a build, fix, review, or story needs Roll QA coverage standards: test pyramid, evidence expectations, visual/E2E boundaries, or CI gates."
---
# Roll QA

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a build, fix, review, or story needs Roll QA coverage standards: test pyramid, evidence expectations, visual/E2E boundaries, or CI gates.

## When Not to Use

- Post-TCR code review; load roll-.review.
- PR review verdicts; load roll-review-pr.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Map risk to unit, integration, E2E, visual, and smoke layers.
2. Define acceptance evidence per story.
3. Use the lightest layer that proves the risk.
4. Escalate coverage when behavior crosses boundaries.

## Hard Gates

- Tests must exercise product code or public entry points.
- Visual checks require rendered evidence when UI is touched.

## Gotchas

- QA chooses evidence depth; it does not replace story-specific acceptance criteria or TCR test design.
- Do not use visual/E2E layers as a substitute for focused unit coverage when the risk is pure logic.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
