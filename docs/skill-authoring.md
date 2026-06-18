# Skill Authoring Guide

Roll skills are context that an agent must carry. Keep every skill small,
routable, and backed by evidence.

## Required Shape

- `SKILL.md` is the hub. Keep trigger boundaries, hard gates, and the shortest
  execution skeleton in the hub.
- `description` is a model-facing routing trigger. Start with `Load when...`,
  keep it at 50 words or fewer, and describe user intent rather than workflow
  internals.
- Put heavy examples, long templates, recovery branches, rubrics, and optional
  runbooks in `references/`.
- Put reusable generated files, snippets, images, or browser probes in
  `assets/`.
- Put deterministic repeated logic in `scripts/` so the agent does not
  reconstruct boilerplate in context.
- If a hub must stay over 250 lines, add a reviewed waiver in the hub and
  explain why splitting would be riskier.

## Route Evidence

Every skill must have route cases in `route-cases/skills.json`:

- At least two positive user intents that should load the skill.
- At least two negative or forbidden-load intents that should not load the
  skill.
- Adjacent skills need explicit negative coverage. Examples:
  `roll-build` vs `roll-design` vs `roll-fix`,
  `roll-loop` vs `roll-.dream` vs `roll-sentinel`,
  `roll-.review` vs `roll-review-pr` vs `roll-peer` vs `roll-spar`.

Changing a description requires updating the route cases in the same change.

## Gotchas

Every hub must include `## Gotchas` or `## Known Failure Modes`.

- Add Roll-specific mistakes, invariants, trigger boundaries, or failure modes.
- Do not repeat generic coding advice.
- If a gotcha comes from a missed load, add a positive route case.
- If a gotcha comes from an off-target load, add a negative route case.
- Treat the section as append-mostly unless an entry is proven obsolete.
- Never instruct agents to source the `roll` binary as if it were a shell
  library: the TS-native `roll` is a bundled CLI, not a bash script, and
  `source "$(command -v roll)"` executes JS as shell (FIX-274). Skill steps call
  `roll <command>` directly.
- Skills do NOT self-score (FIX-343). The working agent never scores its own
  story; the Review Score is a runner-side peer-review outcome, produced by a
  Reviewer in a FRESH, separate session (never a sub-agent of the builder's
  session). Do not author any `self-score` step into a skill.

## Maintenance Workflow

- Description change -> update route cases.
- Observed skill failure -> add gotcha and route evidence.
- Heavy new section -> move it to `references/` or `assets/`.
- Repeatable deterministic command sequence -> move it to `scripts/`.
- New auxiliary file -> link it from `SKILL.md`; unreferenced spokes fail audit.

## Audit Commands

Run these from the roll-skills repository root:

```bash
node scripts/audit-skills.mjs
node scripts/audit-skills.mjs --json
node scripts/audit-skills.mjs --strict
node scripts/test-audit-skills.mjs
```

`--strict` is the gate for description style, route coverage, gotcha coverage,
hub size, missing spoke references, and unreferenced spoke files.
