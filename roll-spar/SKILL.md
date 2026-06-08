---
name: roll-spar
license: MIT
allowed-tools: "Read, Edit, Write, Bash, Agent, Skill"
description: "Load when high-risk logic needs adversarial TDD with attacker tests and defender implementation, such as auth, payments, data integrity, or state machines."
---
# Roll Spar

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when high-risk logic needs adversarial TDD with attacker tests and defender implementation, such as auth, payments, data integrity, or state machines.

## When Not to Use

- Routine QA planning; load roll-.qa.
- Ordinary peer review; load roll-peer.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Define the high-risk invariant.
2. Attacker writes breaking tests first.
3. Defender implements the minimal passing code.
4. Iterate until the invariant is defended.
5. Record adversarial evidence.

## Hard Gates

- Keep attacker/defender roles separate.
- Use only when added cost matches risk.

## Gotchas

- Use spar only for high-risk logic where adversarial tests are worth the added cost.
- Attacker and defender roles must stay separate; do not let implementation assumptions weaken the breaking tests.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
