---
name: roll-peer
license: MIT
allowed-tools: "Read, Bash, Write, Edit"
description: "Load when the user explicitly asks for peer review, cross-agent negotiation, /peer, or a high-risk decision needs an external agent perspective."
---
# Roll Peer

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when the user explicitly asks for peer review, cross-agent negotiation, /peer, or a high-risk decision needs an external agent perspective.

## When Not to Use

- Local self-review; load roll-.review.
- PR-only review; load roll-review-pr.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Confirm peer review is explicitly requested or required by a documented gate.
2. Route to an appropriate external agent.
3. Run bounded negotiation rounds.
4. Record consensus, disagreement, and unresolved questions.
5. Escalate to human when consensus fails.

## Hard Gates

- Do not spawn subagents without explicit permission/tool availability.
- Peer output is advisory unless local gates accept it.

## Gotchas

- Only invoke cross-agent work when explicitly requested or at documented gates; do not surprise the user with extra delegation.
- Consensus does not override local evidence, tests, or the owner decision.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.

## Role in v4 execution profiles

Cross-agent peer review is an **Evaluator capability**: an independent fresh-session reviewer (never the Builder's session) scores the delivery. The Evaluator's judgment is binding for story satisfaction; peer negotiation is the mechanism. In `verified`/`designed` profiles this feeds the `eval-report.md`. Fresh-session independence is required; agent/model diversity is a preference or explicit owner-requested mode, not a default brand rejection. Roles: Supervisor / Designer / Builder / Evaluator.
