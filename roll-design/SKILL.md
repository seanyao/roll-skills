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
4. Split into INVEST stories — each a slice of the agreed detailed design. For every newly split story, write an `**Evaluation contract:**` block (expected_evidence + scorer_focus) — see the full contract's Story Format for the template. Genuinely trivial/internal stories may use a one-item minimal block, but never omit it.
5. Write specs through roll story new and update backlog.

## Hard Gates

- Do not start implementation from this skill.
- Backlog rows and spec files must stay consistent.
- Peer review gates apply only when explicitly available/requested.
- No story decomposition until a detailed design exists and the owner has signed off (proportional to risk). Decomposition slices an agreed design — it is NOT a substitute for designing. If you cannot show at least one complete worked sample of the intended output/behavior, the design is NOT done.
- **Evaluation contract (US-SKILL-030 — planner-builder-evaluator artifact contract)**: every newly split story spec MUST include an `**Evaluation contract:**` block with `expected_evidence` (each item: `kind`, `target`, `proves`) and `scorer_focus`. This artifact is authored by the planner and consumed by builder (roll-build/roll-fix reads before coding) and evaluator (peer score prompt reads the contract; attest surfaces planned-vs-delivered mapping) — not a fixed three-agent collaboration model. Genuinely trivial/internal stories may carry a one-item minimal block, but never omit it. See `references/full-contract.md` for the full template and rules.
- **Visual-evidence contract (FIX-311 — design-phase gate)**: every story spec is born honest. By default each story MUST carry one AC that captures its user-visible surface (web/CLI/TUI), and a web/visual card MUST declare the real product surface in its spec frontmatter — `deliverable_url:` (alias `screenshot_url:`) pointing at the actual deliverable page (e.g. `.roll/features/index.html#casting`), NEVER the card's own dossier/report page. A card with genuinely no visual surface writes `screenshot_exempt: <reason>` (a naked `true`/`yes` is NOT a valid exemption — it must carry a reason). This is enforced, not advisory: `validateStoryVisualEvidence(specText)` in `packages/cli/src/lib/design-visual-evidence.ts` returns `ok:false` for a non-exempt spec with no visual-evidence AC, or one that declares a visual surface but no `deliverable_url`. Keyword matching may only RECOGNISE an exemption / an existing visual-evidence AC — it may NEVER be used to decide a card needs a screenshot (it always does, by default). This is the same contract the runtime enforce gate (FIX-309) and archive gate (FIX-334) hold; the three must agree.

## Gotchas

- Design writes backlog/spec artifacts; it must not quietly start code implementation.
- Use roll story new for story directories; do not hand-create backlog rows without matching dossier structure.
- Jumping from idea straight to INVEST stories (skipping detailed design) produces shallow specs and improvised, inconsistent implementation. Decomposition must slice a concrete, owner-agreed detailed design — schema + at least one complete worked sample + interfaces + mapping rules + edge cases.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
