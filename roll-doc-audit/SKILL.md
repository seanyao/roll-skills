---
name: roll-doc-audit
license: MIT
allowed-tools: "Read, Write, Edit, Glob, Grep, Bash(date:*,find:*,stat:*,wc:*)"
description: "Load when checking README, guides, site pages, CLI help, and docs against implemented behavior, or when auditing documentation inventory, docs/INDEX coverage, undocumented modules, and draft fills from code evidence."
---
# Roll Doc Audit

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when checking README, guides, site pages, CLI help, and docs against implemented behavior. Also load when a project needs documentation inventory, docs/INDEX generation, undocumented module detection, or draft documentation fills for existing code.

## When Not to Use

- Presentation deck generation; load roll-deck.
- Toolchain diagnosis; load roll-doctor.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

0. Consistency audit (Phase 0, first): enumerate shipped surfaces (CLI `--help`, console pages, site copy) and assert each is documented + accurate; check changelog covers the release delta and `site/roll-data.js` matches the real guides/pages/skills. Emit the Consistency Report.
1. Scan documentation, user guidance, site pages, CLI help, and code surfaces.
2. Flag docs/product drift against implemented behavior.
3. Generate or update docs/INDEX.md when inventory is part of the request.
4. Identify undocumented modules.
5. Draft fills from code evidence.

## Hard Gates

- Do not invent behavior without source evidence.
- Keep docs linked and indexable.
- Treat README, guides, site pages, help output, and code behavior as one consistency surface.
- This skill is the judgment-heavy auditor/drafter; the deterministic subset is also enforced by the `roll release` consistency gate (`release-consistency.ts`). Run the skill to investigate/fix; the gate is the floor that blocks silent drift.

## Gotchas

- Draft missing docs from current code evidence; do not hallucinate module behavior from filenames alone.
- Documentation inventory is not a product deck or owner brief.
- A release consistency audit should report drift clearly before drafting new docs.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
