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
3. Detailed design before decomposition — for any non-trivial work, produce a concrete, implementable design artifact and get owner sign-off: (a) data/contract schema, (b) AT LEAST ONE complete worked sample of the intended output/behavior, (c) key interface signatures, (d) mapping/normalization rules, (e) edge cases & failure modes. Depth scales with risk/novelty; trivial work may be light.
4. Split into INVEST stories — each a slice of the agreed detailed design.
5. Write specs through roll story new and update backlog.
6. Self-score the design quality.

## Hard Gates

- Do not start implementation from this skill.
- Backlog rows and spec files must stay consistent.
- Peer review gates apply only when explicitly available/requested.
- No story decomposition until a detailed design exists and the owner has signed off (proportional to risk). Decomposition slices an agreed design — it is NOT a substitute for designing. If you cannot show at least one complete worked sample of the intended output/behavior, the design is NOT done.

## Gotchas

- Design writes backlog/spec artifacts; it must not quietly start code implementation.
- Use roll story new for story directories; do not hand-create backlog rows without matching dossier structure.
- Jumping from idea straight to INVEST stories (skipping detailed design) produces shallow specs and improvised, inconsistent implementation. Decomposition must slice a concrete, owner-agreed detailed design — schema + at least one complete worked sample + interfaces + mapping rules + edge cases.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
