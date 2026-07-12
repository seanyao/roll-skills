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

## Operating Modes

Used in **guided** mode when the owner explicitly starts a Story, and in
**autonomous** mode when the loop scheduler dispatches an eligible Story. The
same TCR, evidence, Evaluator, and release gates apply in both modes.

## When Not to Use

- Pure design or backlog splitting without code; load roll-design.
- Narrow FIX/BUG repair; load roll-fix.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Classify input as Story mode or Fly mode.
2. Read backlog/spec and decide if the story fits one cycle.
3. Split into small TCR actions; per Action route objective work to the 4-stage TCR loop and judgment-dependent work to a 3-stage criteria+Evaluator loop, then define verification.
4. Run test-first implementation, self-review, evidence, and write-back.
5. Commit on green, open PR, and leave remote evidence.

## Hard Gates

- TCR for every micro-step.
- No WIP commits or bypassed verification.
- In the test-gated loop the tests are the weakest link: an isolated Test Adequacy reviewer (Phase 6 Agent 4) audits the tests against the AC, seeing only AC + test files — never the implementation diff or builder reasoning. Self-review of one's own tests (Phase 2) is necessary but not isolation.
- Self-review, attest, and E2E evidence remain required. The Review Score is produced by the runner's fresh-session peer Reviewer — the agent does NOT self-score.
- Docs/code/product alignment is a DoD gate: user-visible behavior, command, output-copy, site, or delivery-view changes update the touched README/docs/guide/site/help in the same delivery.

## Gotchas

- Do not use for pure design/backlog splitting; route that to roll-design until implementation starts.
- TCR and evidence gates remain mandatory even when the code change looks small.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.

## Role in v4 execution profiles

**roll-build is the Builder capability in every execution profile** (`standard` / `verified` / `designed`). Under `designed` it receives the Designer's `design-contract.md` via artifact refs (no shared raw session). Under `verified`/`designed` an independent **Evaluator** (a fresh session) judges the delivery and may open a BOUNDED repair round — you address the blocking findings and write a repair note mapping findings → changes. `standard` is Builder-only. Roles: Supervisor / Designer / Builder / Evaluator.

Under `verified`/`designed` the Builder step itself is the **engine-orchestrated adversarial pair** (US-LOOP-100..106, dormant until `execution_policy.mode` opts in): the loop spawns a heterogeneous test_author ≠ implementer and drives attack rounds, with deterministic never-hang termination, fail-closed degrade to a single builder (`adversarial:degraded`), and a `roll loop adversarial` shadow-run aggregate. See references/full-contract.md § US-SKILL-031.
