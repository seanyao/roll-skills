# Skill Ecosystem Audit Summary

Generated for US-SKILL-023 through US-SKILL-028.

## Strict Audit Result

Command:

```bash
node scripts/audit-skills.mjs --strict
```

Result:

- Skills scanned: 23
- Load-trigger descriptions: 23/23
- Gotchas coverage: 23/23
- Skills over 250 lines: 0
- Skills with auxiliary files: 13
- Route fixture coverage: 2 positive and 2 negative cases for every skill
- Violations: 0

## Hub Size Reduction

The initial `SKILL.md` line baseline was 7,929 lines. Current hub-only
`SKILL.md` total is 1,985 lines. Detailed contracts were moved into
`references/full-contract.md` for the refactored skills.

| Skill | Baseline hub lines | Current hub lines | Moved content |
|---|---:|---:|---|
| roll-design | 924 | 49 | `references/full-contract.md`, `references/engineering-checklist.md` |
| roll-build | 884 | 48 | `references/full-contract.md` |
| roll-fix | 641 | 48 | `references/full-contract.md` |
| roll-debug | 607 | 48 | `references/full-contract.md`, `assets/injectable-bb.js` |
| roll-doc | 595 | 46 | `references/full-contract.md` |
| roll-loop | 563 | 47 | `references/full-contract.md` |
| roll-.changelog | 465 | 47 | `references/full-contract.md` |
| roll-.dream | 374 | 47 | `references/full-contract.md` |
| roll-sentinel | 364 | 46 | `references/full-contract.md` |
| roll-peer | 336 | 47 | `references/full-contract.md` |
| roll-deck | 296 | 46 | `references/full-contract.md` |
| roll-spar | 289 | 47 | `references/full-contract.md` |
| roll-.qa | 258 | 47 | `references/full-contract.md` |

## Maintenance Rules Added

- Descriptions start with `Load when...` and route on user intent.
- `route-cases/skills.json` carries positive and negative route examples.
- Every hub has `Gotchas` with Roll-specific failure modes.
- Long contracts load progressively through `references/`, `assets/`, or
  `scripts/`.
- `scripts/audit-skills.mjs --strict` gates description style, route coverage,
  gotcha coverage, hub size, and spoke integrity.
