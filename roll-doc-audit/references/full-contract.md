# Full Contract Reference

This file preserves the detailed contract extracted from SKILL.md. Read it when the hub points here for exact workflow steps, templates, rubrics, or recovery branches.

Every relative `.roll` path in this carrier resolves from `context.authorities` and is never joined to cwd.

---

# roll-doc-audit

Documentation/product consistency audit plus legacy documentation automation (and deep-read Phase 3b): consistency audit (Phase 0 — shipped surfaces vs docs) → scan docs, user guidance, site pages, CLI help, and code surfaces → index → gap analysis → fill (directory-level) → deep read (cross-directory topics).

Works only on the repository execution selected by ID or alias from `context.issue.execution.repositories`. No manual mode switching or cwd fallback is allowed.

## When to Use

- Starting to work on a legacy project with scattered or missing documentation
- `docs/INDEX.md` is out of date or doesn't exist yet
- README, guides, site pages, CLI help, or docs may be drifting from implemented behavior
- `roll-.dream` Scan 6 flagged undocumented modules (REFACTOR entry referencing roll-doc-audit)
- You want a complete picture of what's documented and what isn't

## When Not to Use

- The project has up-to-date, maintained docs — no need to rebuild the index
- You need authoritative documentation reviewed and approved (drafts only; human reviews and commits)
- You want to write a specific known doc from scratch — write it directly

## Invocation

```
$roll-doc-audit              # Full consistency/inventory run
$roll-doc-audit --dry-run    # Phases 1–2 only; print Phase 3 plan without writing any files
$roll-doc-audit --force      # Re-generate drafts even for existing files
```

## Phase 0 — Consistency Audit

Run this phase **first**, before the inventory phases (1–3b). The inventory phases ask
*"what is undocumented?"*; Phase 0 asks the sharper release-time question: *"does every shipped
user-facing surface have a doc, and does that doc still tell the truth?"* It is the
judgment-heavy pass — enumerate the real surfaces, compare them against the docs, and draft the
drift fixes.

**Skill vs. gate.** This skill is the **investigator + drafter**: a human (or agent) runs it to
find drift and write the fix. The *deterministic, enumerable* subset of these same checks is
**also** enforced inside the `roll release` consistency gate (`release-consistency.ts`), so a
drift cannot silently ship even when nobody runs this skill. The gate is the **floor** (it
blocks the release on the mechanical mismatches it can prove); this skill is the **ceiling** (it
also catches the judgment cases — a description that is technically present but stale, a doc that
contradicts behavior — that a mechanical check cannot decide). Run the skill to investigate and
fix; trust the gate to keep the floor from dropping.

**Scope:** Phase 0 reads only — it never writes during the audit itself. Its output is the
**Consistency Report** (template at the end of this phase) plus a list of drafted fixes the
operator reviews and applies. As with every other phase, do not fabricate behavior: every
"Accurate?" verdict must cite the source (help text, code path, or guide line) it was checked
against.

This phase has three check-classes. Run all three.

### 0.1 — Shipped-surface coverage

Enumerate every user-facing surface the product ships, then assert each one is **documented**
AND **described accurately** (the doc's description matches actual behavior, not a stale copy).

**Surface 1 — CLI commands.**

Gather the evidence:

```
# every top-level command
roll --help            # or: node dist/roll.mjs --help

# every subcommand of a command that has subcommands
roll <command> --help  # e.g. roll loop --help, roll agent --help
```

Parse the command/subcommand list and each one-line description out of the help output. For each
command, locate its documentation in `guide/{en,zh}/*.md` and/or `README.md` (grep the command
name).

- **Pass:** the command appears in at least one guide page or `README.md`, AND the documented
  description does not contradict the `--help` description / actual behavior.
- **Fail (undocumented):** a command exists in `--help` but no guide/README mentions it.
- **Fail (stale):** a command is documented, but the doc's description disagrees with `--help`
  or with the implemented behavior (e.g. renamed flag, removed option, changed default).

Draft the fix: for an undocumented command, draft the missing guide section (purpose, synopsis,
options) from the `--help` text and the command's source. For a stale description, draft the
corrected sentence and cite the `--help` line or code path that proves the new truth.

**Surface 2 — Web-console pages / machine-global breadcrumb entries.**

The product's console exposes a fixed set of machine-global pages (e.g. **Agents · Skills ·
Tools · Conventions · About**). Each shipped page must be reflected in the site copy
(`site/roll-data.js`) and in the guides.

Gather the evidence:

```
# the breadcrumb / nav set as the site renders it
grep -nE "Agents|Skills|Tools|Conventions|About" site/roll-data.js

# the guide pages that should describe those surfaces
ls guide/en guide/zh
```

- **Pass:** every shipped console page is present in `site/roll-data.js` and has a corresponding
  guide treatment.
- **Fail:** a console page ships but `site/roll-data.js` (or the guide) never reflects it, or the
  site lists a page that no longer exists.

Draft the fix: add/correct the `site/roll-data.js` entry and draft the guide paragraph for the
missing page; cite the page's source.

**Verdict for 0.1:** flag *any* shipped surface with **no doc**, or **a doc whose description
contradicts the implementation**. Each flag becomes a row in the Consistency Report.

### 0.2 — Changelog coverage of the release delta

Assert that every user-facing card merged since the last release is reflected in `CHANGELOG.md`.

Gather the evidence:

```
# latest release tag (roll tags look like v2026.601.4)
LATEST=$(git describe --tags --abbrev=0 --match 'v*')

# commits merged since that tag
git log "$LATEST"..HEAD --oneline

# card ids in the delta (US-/FIX-/REFACTOR-)
git log "$LATEST"..HEAD --format='%s%n%b' | grep -oE '(US|FIX|REFACTOR)-[0-9]+' | sort -u
```

For each card id in the delta, decide whether it is **user-facing** (changes CLI behavior,
output, flags, console pages, or documented workflow) — purely internal refactors that change no
surface are out of scope. Then:

- **Pass:** the user-facing card has a `CHANGELOG.md` entry **or** its spec carries an explicit
  `changelog_exempt:` marker (read the card's spec under `.roll/features/` to check).
- **Fail:** a user-facing delta card has neither a `CHANGELOG.md` entry nor a `changelog_exempt:`
  marker — it would ship undocumented.

Check changelog presence:

```
grep -nE '(US|FIX|REFACTOR)-[0-9]+' CHANGELOG.md
```

Draft the fix: for each missing user-facing card, draft a plain-language `CHANGELOG.md` line
(what changed / what the user can now do) from the card's spec and merged diff — no internal
jargon. If the card is genuinely not user-facing, note that it needs a `changelog_exempt:`
marker rather than a changelog line, and say why.

**Verdict for 0.2:** report every user-facing delta card that would ship undocumented.

### 0.3 — Site-copy ↔ generated-console consistency

Assert that `site/roll-data.js` matches reality on three axes. This is the class where a new
guide page or console page ships but the site index is never updated to link it.

Gather the evidence:

```
# every guide file that exists on disk
ls guide/en guide/zh

# the guide nav / page list the site actually exposes
grep -nE "guide|slug|nav|page" site/roll-data.js

# the machine-global breadcrumb description and the skill tiles
grep -nE "Agents|Skills|Tools|Conventions|About|skill" site/roll-data.js
```

Then check each axis:

1. **Guide reachability** — every `guide/<lang>/*.md` file on disk is reachable from the site
   guide nav defined in `site/roll-data.js`.
   - **Fail:** a guide file exists but is not linked from the nav (orphaned page), or the nav
     links a guide slug that has no file (dead link).
2. **Breadcrumb completeness** — the machine-global breadcrumb description in `site/roll-data.js`
   lists the **real** set of machine pages (the same set verified in 0.1, Surface 2).
   - **Fail:** the breadcrumb omits a shipped page or lists a removed one.
3. **Skill-tile correctness** — the skill tiles in `site/roll-data.js` match the actual skill
   set (the `roll-*` skill directories that ship).
   - **Fail:** a shipped skill has no tile, or a tile points to a retired skill.

Draft the fix: add the missing nav entry / breadcrumb item / skill tile to `site/roll-data.js`,
or remove the stale one; cite the on-disk file (or its absence) that proves the drift.

**Verdict for 0.3:** flag every stale or missing `site/roll-data.js` entry.

### Consistency Report

After running 0.1–0.3, emit one report. One row per surface checked; group by check-class. The
`Fix` column states the drafted correction (and, for an undocumented surface, the path of the
draft).

```markdown
> roll-doc-audit — Consistency Report (YYYY-MM-DD)
> Phase 0 read-only audit. Floor enforced by `roll release` consistency gate (release-consistency.ts).

## 0.1 Shipped-surface coverage

| Surface | Documented? | Accurate? | Drift | Fix |
|---------|-------------|-----------|-------|-----|
| `roll loop` (CLI) | ✅ guide/en/loop.md | ❌ | guide says `--once`, help says `--single` | draft: rename flag in loop.md:42, cite `roll loop --help` |
| `roll agent swap` (CLI) | ❌ | — | command ships, no guide/README mention | draft guide/en/agents.md §swap from `roll agent swap --help` |
| Console: Tools page | ✅ guide | ❌ site | page ships, missing from site/roll-data.js | draft: add Tools entry to site/roll-data.js |

## 0.2 Changelog coverage of the release delta

| Card | User-facing? | In CHANGELOG / exempt? | Drift | Fix |
|------|--------------|------------------------|-------|-----|
| US-AGENT-041 | yes | ❌ | merged since v2026.601.4, no entry | draft CHANGELOG line from spec |
| REFACTOR-118 | no | — | internal only | mark `changelog_exempt:` in spec |

## 0.3 Site-copy ↔ generated-console consistency

| Surface | Documented? | Accurate? | Drift | Fix |
|---------|-------------|-----------|-------|-----|
| guide/zh/consistency.md | ✅ on disk | ❌ nav | file exists, not linked in site nav | draft: add nav entry to site/roll-data.js |
| Skill tile: roll-doc-audit | ✅ | ❌ | tile still labeled `roll-doc` | draft: update tile id in site/roll-data.js |

## Summary

- Surfaces checked: N (CLI N / console N / changelog cards N / site entries N)
- Drift found: N (undocumented N / stale N / unlinked N)
- Drafted fixes: N — review and apply, then re-run.
```

A clean run prints the report with no drift rows and the summary line `Drift found: 0`.

---

## Phase 1 — Scan & Index

Scan the selected repository execution root for all `*.md` files and known convention files.

**Exclusions — never scan these directories:**

```
node_modules/   .git/   dist/   build/   .shared/   .roll/dream/   .roll/briefs/
```

**Convention files — detect by filename anywhere in the tree:**

```
AGENTS.md   CLAUDE.md   GEMINI.md   CONVENTIONS.md   CONTRIBUTING.md
ARCHITECTURE.md   ADR-*.md
```

**Classification rules:**

| Category | Criteria |
|----------|----------|
| `guide` | Path under `guide/` |
| `domain` | Path under `.roll/domain/` |
| `convention` | Filename matches convention markers list above |
| `module` | File is `<dir>/README.md` for a source directory |
| `stray` | None of the above (top-level, unorganized, or orphaned) |

**Output — produce/update `docs/INDEX.md`:**

```markdown
# Documentation Index

> Auto-generated by roll-doc-audit on YYYY-MM-DD. Edit individual docs, not this file.

## Index

| Path | Title | Category | Last Modified |
|------|-------|----------|---------------|
| guide/en/loop.md | Loop User Guide | guide | 2026-05-01 |
| AGENTS.md | Agent Conventions | convention | 2026-04-28 |

## Coverage Summary

- Total docs indexed: N
- By category: guide (N) / domain (N) / convention (N) / module (N) / stray (N)

## Gap Report

Directories with ≥3 source files and no linked documentation:

| Directory | Source Files | Missing Doc |
|-----------|-------------|-------------|
| src/commands/ | 8 | README.md |
```

`docs/INDEX.md` is always overwritten on each run — it is a derived artifact, not authoritative content.

## Phase 2 — Gap Analysis

Walk every directory (applying Phase 1 exclusions):

1. Count non-hidden, non-`.md` source files directly in the directory
2. If count ≥ 3 AND no `README.md` in that directory AND no `docs/INDEX.md` entry links to it → **module gap**
3. **High fan-in gap**: a directory imported by **≥ 5 other source files** is a gap targeting `<dir>/README.md`, **even if it has < 3 source files** — critical low-volume modules (shared utils, single-file core) must not be skipped by the file-count threshold. The existing count ≥ 3 rule (rule 2) continues to apply independently; high fan-in only widens what qualifies, it never overrides rule 2.

**Special gaps (checked once per project):**
- No `.roll/domain/` directory or empty → gap: `.roll/domain/context-map.md`
- No `CONVENTIONS.md` or `docs/CONVENTIONS.md` exists → gap: `docs/CONVENTIONS.md`

**Threshold**: a directory qualifies for a module README gap when **file count ≥ 3 OR imported by ≥ 5 other source files** (default). The fan-in count comes from the Phase 3b symbol table `imports` edges; exclude test files (`*.test.*`, `*.spec.*`, `tests/`) when counting referencing files. An existing `<dir>/README.md` is never overwritten unless `--force`. Tune by editing the skill.

Record all gaps — they become Phase 3 input.

## Phase 3 — Fill

**Skip this phase entirely when:**
- `--dry-run` was passed (print the fill plan to stdout, write nothing)
- Phase 2 found zero gaps

**Idempotency rule**: Without `--force`, re-running when no new gaps exist is a **no-op** — no files are written, no existing drafts are modified.

For each gap:
1. Read up to 20 source files from the target directory to infer module purpose, key exports, dependencies, and configuration patterns
2. Generate a draft document at the conventional location (see table below)
3. **Skip if the target file already exists**, unless `--force` was passed

**Draft locations by gap type:**

| Gap Type | Draft Location |
|----------|---------------|
| Module with no README | `<dir>/README.md` |
| No `.roll/domain/` entries | `.roll/domain/context-map.md` |
| No conventions doc | `docs/CONVENTIONS.md` |
| Missing `AGENTS.md` `## Where to Look` section | `AGENTS.md` (append or create) |

**AGENTS.md Where to Look bootstrap:**

When `AGENTS.md` has no `## Where to Look` section, generate and append one:

1. Scan which doc directories actually exist: `.roll/domain/`, `.roll/features/`, `.roll/verification/`, etc.
2. Generate pointer lines **only for directories that actually exist** — never fabricate pointers to missing paths
3. If `.roll/domain/context-map.md` exists, read it to extract Bounded Context names for a one-line summary
4. Append the section to the end of `AGENTS.md` with the standard draft header
5. **Idempotency**: if `## Where to Look` already present, do not overwrite or duplicate — skip this gap

Draft output format:

```markdown
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.

## Where to Look
- **Domain model**: `.roll/domain/context-map.md` — Contexts: {list from context-map, or "see file"}
- **Story details**: `.roll/features/` — AC, implementation specs, dependencies
```

Only include lines for directories that already exist in the project.

**Every generated file starts with this exact header line:**

```
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.
```

**Minimum draft content:**

- Module README: purpose (1–2 sentences), key files with one-line descriptions, dependencies (imports from / depended on by)
- Context map: bounded contexts identified in the project, their responsibilities, relationships
- Conventions: detected patterns — ENV vars, naming conventions, repeated file structure templates

Do not fabricate details — infer only from source files actually read.

## Phase 3b — Deep Read

Deep-read phase that builds a full project symbol table (without truncation) and auto-detects
cross-directory topics that directory-level Phase 3 alone cannot discover.

**Trigger conditions** — Phase 3b runs when either is true:
- Phase 2 found any gap (module or special gap)
- The project exhibits code characteristics that Phase 3a cannot capture:
  cross-directory import chains spanning ≥ 3 directories, state enums referenced by
  multiple files, external URL/endpoint calls, or CI pipeline configuration files

Pure documentation-only projects (no source code gaps, no code characteristics) skip Phase 3b.

### Step 1 — Build Symbol Table

Read each source file through the context-feed budget (US-CTX-001), not by hard-stuffing whole
files unconditionally. The existing Phase 3 "up to 20 source files" count limit does not apply —
Phase 3b aims for a complete project symbol table — but per-file material still goes through the
feed budget: files within budget are read in full, and over-budget files are summarized/chunked
with an explicit notice (never silently truncated) so the inner agent's context window is not
blown. This replaces the previous "read every source file in full, no truncation" unbounded path.

**Exclusion directories** (same as Phase 1):

```
node_modules/   .git/   dist/   build/   .shared/   .roll/dream/   .roll/briefs/
```

**Symbol table fields:**

| Field | Content |
|-------|---------|
| `exports` | class / interface / type / function / const declarations, per file |
| `imports` | source file → target file mapping (dependency graph edges) |
| `enums` | enum declarations with enumerated values, per file |
| `external_urls` | `fetch(...)` / `axios` / `http.*` calls, `API_ENDPOINT` / `*_URL` / `*_HOST` constants, hardcoded `https?://` strings (exclude comments and test fixtures) |
| `configs` | CI workflow YAML files, build config paths, test framework config file paths |

**`--dry-run` behavior:** print symbol table summary counts per category (e.g. "exports: 42, imports: 156, enums: 7, external_urls: 4, configs: 3") plus top-N examples per category. Write nothing to disk.

**`--force` behavior:** unchanged — `--force` only affects draft generation (Phase 3/3b output files).
The symbol table itself is rebuilt from scratch on every run regardless of flags.

### Step 2 — Topic Detection

Using the symbol table from Step 1, detect cross-directory topics. Each topic type has a
detection rule and a target output file. Skip any topic whose target file already exists
(unless `--force`). Skip any topic whose detection rule finds no matches.

| Topic | Detection Rule | Output |
|-------|---------------|--------|
| 数据流 / 调用链 | Entry files (`bin/`, `cmd/`, `main.*`, `index.*`) → trace import chain to leaf nodes; require ≥ 1 chain spanning ≥ 3 directories | `docs/data-flows.md` |
| 状态机 | Enums matching `*State` / `*Status` referenced by ≥ 2 source files | `docs/state-machines.md` |
| 外部集成 | `external_urls` entries from symbol table (exclude comment/test-fixture matches) | `docs/integrations.md` |
| 部署管线 | `.github/workflows/*.yml` / `.gitlab-ci.yml` / `circle.yml` / `Jenkinsfile` present, with deploy URL patterns detected | `docs/deployment.md` |
| Agent 入口 (AGENTS.md) | Project root has no `AGENTS.md` AND `src/` (or equivalent source root) has ≥ 3 subdirectories | `AGENTS.md` |
| 高引用目录 | Directory imported by ≥ 5 other source files, even if directory itself has < 3 source files | `<dir>/README.md` |

#### Data Flow / Import Chain Tracing

**Entry point selection:** start from entry files — any file matching patterns:
`bin/*`, `cmd/**/*`, `main.*` (e.g. `main.ts`, `main.py`), `index.*` (e.g. `index.ts`, `index.jsx`),
`App.*`, `server.*`. Exclude `node_modules/`, `dist/`, `build/`, test files (`*.test.*`, `*.spec.*`, `tests/`).

**Chain construction:**
1. For each entry file, read its imports from the symbol table's `imports` field.
2. Recursively follow each imported file to its own imports, building a directed call graph.
3. Stop at leaf nodes — files that import nothing or whose imports all point to:
   - External packages (node_modules / stdlib / third-party)
   - Already-visited nodes (cycle termination)
4. Each distinct path from an entry file to a leaf is one call chain.

**Threshold (cross-directory filter):**
A call chain is valid for inclusion only if it spans **≥ 3 distinct source directories**.
Count based on the unique parent directories of files in the chain:
  `src/cli/main.ts → src/commands/build.ts → lib/utils/fs.ts` = 3 directories ✅
  `src/cli/main.ts → src/cli/config.ts → lib/utils/fs.ts` = 2 directories ❌
If no chain meets the ≥ 3 directory threshold, skip generation entirely (no empty `docs/data-flows.md`).

**Output document structure** (`docs/data-flows.md`):

```markdown
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.

# Data Flows

## Flow: {short descriptive name from entry file purpose}

**Entry point:** `{entry_file}:{line}`
**Directories spanned:** N ({comma-separated list})

### Complete Call Chain

{entry_file}
  → import {symbol} from "{file}" ({line})
    → import {symbol} from "{file}" ({line})
      → ... (leaf node)

### Files Involved

| Step | File:Line | Function / Method |
|------|-----------|-------------------|
| 1 | `path/to/file:12` | `functionName` |
| 2 | `path/to/file:34` | `otherFunction` |
| ... | ... | ... |
```

- Sort flows by number of directories spanned, descending (widest cross-cutting flow first).
- If an entry file produces multiple distinct call chains, list each one as a separate flow entry.
- `file:line` annotations must come from actual symbol table records — do not fabricate.

**Idempotency:** skip (do not overwrite) if `docs/data-flows.md` already exists, unless `--force`.

#### State Machine

**Detection rule:** enums whose name matches `*State` or `*Status` (case-insensitive)
AND that are imported/referenced by **≥ 2 distinct source files**. Only count
imports from source files — exclude test files (`*.test.*`, `*.spec.*`, `tests/`)
and declaration files (`*.d.ts`).

**Threshold:** if no enum meets the ≥ 2 cross-file reference threshold, skip
generation entirely (no empty `docs/state-machines.md`).

**Output document structure** (`docs/state-machines.md`):

```markdown
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.

# State Machines

## State: `{EnumName}`

**Defined in:** `{file}:{line}`

### States
{list of all enum values}

### Referenced By

| File:Line | Context |
|-----------|---------|
| `path/to/file:12` | `function processOrder(status: OrderState)` |
| `path/to/file:34` | `if (status === OrderState.Pending)` |

### Inferred Transitions

| From | To | Evidence |
|------|----|----------|
| `Pending` | `Processing` | `order.ts:45` — `if (status === Pending) { status = Processing }` |
| `Processing` | `Shipped` | `handler.ts:78` — assignment after `ship()` call |
```

**Transition inference:** scan the referencing files for patterns where an enum
value is checked (`if (status === X)`, `case X:`) and the status variable is
reassigned to another enum value in the same block. Record each distinct
`{from, to, evidence file:line}` pair. Only include transitions backed by
explicit code — do not fabricate implied transitions.

**Output rules:**
- One top-level `## State:` section per qualifying enum, sorted alphabetically.
- Each enum section lists all defined values under `### States`.
- `file:line` annotations must come from actual symbol table records — do not fabricate.
- Existing `docs/state-machines.md` → skip unless `--force`.
- No qualifying enum → skip generation entirely (no empty document).

#### External Integrations

**Detection rule:** scan `external_urls` from the symbol table —
`fetch(...)` / `axios` / `http.get` (and `http.*`) calls, constants shaped like
`API_ENDPOINT` / `*_URL` / `*_HOST`, and hardcoded `https?://` strings. Exclude
matches inside comments and test fixtures (`*.test.*`, `*.spec.*`, `tests/`,
`fixtures/`).

**Threshold:** if no external integration is detected, skip generation entirely
(no empty `docs/integrations.md`).

**Output document structure** (`docs/integrations.md`):

```markdown
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.

# External Integrations

## Integration: `{endpoint URL}`

### Call Sites

| File:Line | Timeout | Error Handling / Fallback |
|-----------|---------|---------------------------|
| `path/to/file:12` | `timeout: 5000` | `.catch` retry fallback |
| `path/to/file:48` | — | try/catch |
```

**Per-integration fields:**
- **endpoint URL** — the external URL / endpoint reached.
- **call file:line** — every source location calling this endpoint.
- **timeout config** — the value if the calling code carries a `timeout: N` field,
  otherwise `—`.
- **error handling / fallback** — recorded when the calling code has a `.catch`
  handler or a `try` / `catch` block around the call, otherwise `—`.

**Output rules:**
- The same endpoint reached from multiple sites is merged into **one** integration
  section that lists **all** its call sites — never one section per call.
- One top-level `## Integration:` section per distinct endpoint, sorted alphabetically.
- `file:line` annotations must come from actual symbol table records — do not fabricate.
- Existing `docs/integrations.md` → skip unless `--force`.
- No external integration detected → skip generation entirely (no empty document).

#### Deployment Pipeline

**Detection rule:** the project has at least one CI configuration file —
`.github/workflows/*.yml` (or `*.yaml`) / `.gitlab-ci.yml` / `circle.yml` /
`.circleci/config.yml` / `Jenkinsfile` — AND a deploy URL pattern appears in the
code or CI config (vercel / netlify / cloudflare / firebase, or hostnames ending
in `*.app` / `*.dev`). Pull deploy URLs from the `configs` and `external_urls`
fields of the symbol table.

**Threshold:** if no CI configuration file is detected, skip generation entirely
(no empty `docs/deployment.md`).

**Output document structure** (`docs/deployment.md`):

```markdown
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.

# Deployment

## Pipeline: `{ci config file}`

**CI Platform:** GitHub Actions
**Trigger events:** push (main), pull_request, release

### Key Jobs

| Job | File:Line | Purpose |
|-----|-----------|---------|
| `test` | `.github/workflows/deploy.yml:18` | run test suite |
| `build` | `.github/workflows/deploy.yml:25` | compile artifacts |
| `deploy` | `.github/workflows/deploy.yml:33` | deploy to Vercel |

### Deploy Targets

| URL | File:Line |
|-----|-----------|
| `https://my-app.vercel.app` | `.github/workflows/deploy.yml:14` |

### Environment Variables

| Name | File:Line |
|------|-----------|
| `NODE_ENV` | `.github/workflows/deploy.yml:11` |
| `VERCEL_TOKEN` | `.github/workflows/deploy.yml:12` |
```

**Per-pipeline fields:**
- **CI platform** — inferred from which config file is present (GitHub Actions /
  GitLab CI / CircleCI / Jenkins).
- **trigger events** — the events that start the pipeline (`push` / `pull_request` /
  `tag` / `release`), read from the CI config.
- **key jobs** — each job / stage name with its `file:line` location.
- **deploy target URL** — the deploy URL(s) matched by the detection rule.
- **environment variable names** — every env var name referenced in the CI config,
  listed **without values** (never emit secret values, only names).

**Output rules:**
- One top-level `## Pipeline:` section per CI configuration file, sorted alphabetically.
- `file:line` annotations must come from actual symbol table / CI config records — do not fabricate.
- Existing `docs/deployment.md` → skip unless `--force`.
- No CI configuration detected → skip generation entirely (no empty document).

#### Agent Entrypoint (AGENTS.md)

This topic handles the **「文件不存在 → 创建」** case: when a project has no agent-facing
convention file at all, generate a complete baseline `AGENTS.md`. It is complementary to the
Phase 2 **"AGENTS.md Where to Look bootstrap"** rule, which handles the **「文件存在 → 补章节」**
case (append a missing `## Where to Look` section to an existing `AGENTS.md`). The two rules
never overlap — this one only fires when no `AGENTS.md` exists.

**Detection rule:** the selected repository execution root has **no** `AGENTS.md` AND its source root (`src/`, or the
equivalent — `lib/`, `app/`, `pkg/`, etc.) contains **≥ 3 subdirectories**. If `AGENTS.md`
already exists, skip entirely (do not overwrite unless `--force`). If the source root has
fewer than 3 subdirectories, skip — the project is too small to warrant a baseline doc.

**Output document structure** (`AGENTS.md`) — at minimum three required sections:

```markdown
> **Draft** — auto-generated by roll-doc-audit on YYYY-MM-DD. Review before treating as authoritative.

# {Project Name}

{One-sentence positioning: what this project is, inferred from README / package metadata.}

## Where to Look

- **Domain model**: `.roll/domain/context-map.md` — Contexts: {list, or "see file"}
- **Story details**: `.roll/features/` — AC, implementation specs, dependencies
- **Doc index**: `docs/INDEX.md` — generated documentation map

## Source Layout

| Directory | Purpose |
|-----------|---------|
| `src/parser/` | tokenize and parse input (≤ 2 lines each) |
| `src/codegen/` | emit output artifacts |
| `src/cli/` | command-line entry and option wiring |
```

**Per-section rules:**
- **Project positioning** — a single sentence describing what the project does, inferred from
  the README / package metadata; never fabricate beyond what the source supports.
- **`## Where to Look`** — pointer lines **only for directories that actually exist**
  (`.roll/domain/`, `.roll/features/`, `docs/INDEX.md`, etc.); never fabricate pointers to
  missing paths. If `.roll/domain/context-map.md` exists, read it for Bounded Context names.
- **Source Layout** — one row per key source subdirectory, each description **≤ 2 lines**,
  inferred from the files actually read in the symbol table.

**Output rules:**
- Existing `AGENTS.md` → skip unless `--force` (never overwrite a human-authored file).
- Source root with < 3 subdirectories → skip generation entirely (no empty `AGENTS.md`).
- All three sections must be present in the generated file.

#### High Fan-in Directory (README)

This topic complements the Phase 2 file-count threshold. A directory may hold only one or two
source files yet be imported across the whole codebase (shared utils, a single-file core
module). The file-count rule (≥ 3 files) alone skips such hot paths, so high fan-in widens the
threshold to **「文件数 ≥ 3 OR 被 ≥ 5 个文件引用」**.

**Detection rule:** using the symbol table's `imports` edges, count the **distinct source files
that import any file in the directory**. If that count is **≥ 5**, the directory qualifies for a
`<dir>/README.md` gap, **even when it contains < 3 source files**. Only count referencing files
that are source files — exclude test files (`*.test.*`, `*.spec.*`, `tests/`) and files inside
the directory itself. This rule operates **in addition to** the Phase 2 count ≥ 3 rule, never
replacing it: directories meeting either condition get a README.

**Output rules:**
- Target file is `<dir>/README.md`, generated with the same Module README content as Phase 3
  (purpose, key files, dependencies).
- Existing `<dir>/README.md` → skip unless `--force` (never overwrite).
- Directory imported by < 5 source files **and** holding < 3 source files → skip (no gap).
- A directory already qualifying under the count ≥ 3 rule is not double-counted — one README.

### Step 3 — Source Annotations

Every topic document generated in Step 2 must cite `file:line` for each claim (function call,
endpoint URL, state transition, CI job, import path). Annotations must come from actual
symbol table records — do not fabricate line numbers. Follows the same "Do not fabricate"
rule as Phase 3.

**Mandatory `file:line` column** — each topic document's source-reference tables MUST carry a
dedicated `file:line` column so the reader can jump straight to the code:
- 「涉及文件」/ Files Involved table → one `file:line` per row.
- 「引用文件」/ Referenced By table → one `file:line` per referencing site.
- 「调用链」/ Complete Call Chain table → one `file:line` per hop.

Do **not** fabricate a `file:line` value: every annotation MUST come from an actual symbol
table record (the same "Do not fabricate" rule as above). If the symbol table has no line for
a claim, omit the row rather than invent a location.

---

## Phase 4 — Report

After all phases complete, output a summary:

```
📚 roll-doc-audit complete

Phase 1 — Index
  N docs scanned, docs/INDEX.md updated
  Categories: guide(N) domain(N) convention(N) module(N) stray(N)

Phase 2 — Gaps
  N undocumented module directories found
  N special gaps (domain map / conventions)

Phase 3 — Fill
  N drafts generated: [list of paths]
  N skipped (already exist; use --force to regenerate)

Phase 3b — Deep Read
  Symbol table: exports(N) imports(N) enums(N) external_urls(N) configs(N)
  N topic documents generated:
    - docs/dataflow.md       (data-flow)          source entries: N
    - docs/state-machines.md (state-machine)       source entries: N
    - docs/integrations.md   (external-integration) source entries: N
  N topics skipped (no matches or already exist; use --force to regenerate)

📋 Review priority (largest / most active modules first):
  1. src/commands/README.md — 8 source files
  2. docs/CONVENTIONS.md — 6 patterns detected
```

Each generated topic document is listed with its **path**, **type**, and **来源条目数 /
source entries** (how many symbol-table records back the document). When Phase 3b produced no
subject-level documents, print exactly one line and do **not** error:

```
Phase 3b: no subject-level drafts generated
```

If `--dry-run`, the `Phase 3b — Deep Read` section is shown the same way but every generated
line is tagged `(plan)` — matching Phase 3's dry-run convention (nothing is written):

```
Phase 3b — Deep Read  (plan)
  N topic documents would be generated:
    - docs/dataflow.md (data-flow) source entries: N  (plan)
```

If no gaps were found:

```
✅ roll-doc-audit: no gaps found. docs/INDEX.md updated.
```

If `--dry-run`:

```
🔍 roll-doc-audit --dry-run: N drafts would be generated (nothing written).
```

## Rules

- Never modify existing documentation files — only generate new drafts
- `docs/INDEX.md` is the only existing file that may be overwritten (derived artifact)
- Draft files are never committed by this skill — human reviews and commits them
- Works on any project; always read project structure before acting
- Do not fabricate module details — infer only from source files actually read
