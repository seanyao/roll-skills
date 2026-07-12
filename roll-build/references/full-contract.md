# Full Contract Reference

This file preserves the detailed contract extracted from SKILL.md. Read it when the hub points here for exact workflow steps, templates, rubrics, or recovery branches.

---

# Roll Build (Universal Delivery)

> Follows the Architecture Constraints, Development Discipline, and Engineering Common Sense defined in the project AGENTS.md.

One entry point. Any input. Full delivery.

## Trigger

**Input detection:**

```
Input received
  ├── matches "US-[A-Z]+-[0-9]+"  → Story mode: read BACKLOG → TCR workflow
  ├── matches "FIX-[A-Z]+-[0-9]+" → redirect to $roll-fix
  ├── matches "IDEA-[0-9]+"       → redirect to $roll-idea (lookup and expand)
  └── anything else               → Fly mode: clarify → design → execute
```

**Story mode** — use when:
- The user provides a `US-XXX` identifier
- An existing backlog Story needs to be executed

**Fly mode** — use when:
- The user has a vague one-sentence request
- No `US-XXX` exists yet; planning and execution are both needed
- No input at all — ask the user what they want to build

**Redirect to `$roll-fix`** when:
- Input matches `FIX-XXX` or `BUG-XXX` pattern

Do not use for:
- Pure analysis or research with no code changes (use `$roll-design`)
- Single-line hotfix with no planning needed (use `$roll-fix`)

## Core Philosophy

1. **Clarity over assumptions** — When scope is unclear, clarify first
2. **Just enough planning** — Plan to the level the uncertainty demands
3. **TCR rhythm** — Test-first, micro-steps, auto-commit on green, auto-revert on red
4. **Push to GitHub** — Complete implementation, commit, and push; code is on remote
5. **Stay reversible** — Every micro-step leaves the repo in a clean, green state

---

## Mode A: Story Mode (US-XXX input)

Activate when input is a `US-[A-Z]+-[0-9]+` identifier.

### Step A1: Pre-flight self-check (US-AGENT-007)

Before reading the Story in depth or splitting actions, **read the Agent profile** from the story's feature md and decide whether this cycle can realistically deliver it. The check is mechanical and turns on a single axis — the story's `est_min` estimate (US-AGENT-022 retired the old three-dimension type/est/risk routing; there is no per-agent capacity range, risk zone, or history threshold anymore):

```
inputs:
  story.est_min       (from **Agent profile:** block, US-AGENT-001)
  story.chain_depth   (0 unless already a downgrade product)

complexity tier (lib/loop_pick_agent.py, single source of truth):
  est_min <= 8        → easy
  8 < est_min <= 20   → default
  est_min > 20        → hard
  missing / illegal   → default

verdict:
  too_big when:
    story.est_min is large enough that even the `hard` tier won't fit one
    cycle — i.e. the work plainly composes too many files / behaviours to
    land green in a single cycle — AND story.chain_depth == 0
    (still have downgrade budget; don't burn a cycle on a guaranteed miss).
  ok otherwise
```

Output the verdict as the first line of the cycle response:

```yaml
verdict: ok    # or: too_big
reason: <one short line — which condition triggered, with numbers>
```

When `verdict: ok` → continue to Step A2 normally.
When `verdict: too_big` → **self-downgrade** rather than burn the cycle on a guaranteed miss:

1. Invoke `roll-design` to re-split the story into ≥2 smaller sub-stories. Each
   sub-story inherits the parent's ORIGINAL inbound dependencies — **never** the
   parent itself (depending on the about-to-be-parked parent would deadlock the
   child forever).
2. Hand the split to the loop with the v3 command:

   ```bash
   roll loop self-downgrade <story-id> "<one-line reason>" <subA,subB,...>
   ```

   It parks the parent at 🚫 Hold (a grouping row the picker skips), appends the
   sub-stories as 📋 Todo rows (correct `depends-on`, `chain_depth = parent + 1`,
   never pointing at the parent), closes any open PR for the parent and deletes
   its branch (invariant I3), and records a `story:split` event for reconciliation.
3. Exit cleanly — **no TCR commits this cycle**. The next loop cycle picks up the
   first sub-story (smaller, should pass pre-flight).

The command enforces the **chain-depth cap** (US-AGENT-009): a story whose chain
has already auto-split twice (`chain_depth ≥ 2`), or one that yields fewer than 2
sub-stories (irreducible), is **not** split again — `roll loop self-downgrade`
parks the parent at 🚫 Hold and raises an ALERT for human triage (a `story:split`
with `capped: true`) instead of recursing. Pass the sub-ids you have (or none);
the command decides. The cap exists purely to stop infinite split chains.

> Pre-flight is honest, not paranoid: a small story (est_min ≤ 8 — the `easy` tier — with chain_depth=0) should almost always go `ok`. The check pays off on the long tail — stories with a large `est_min` that, on inspection, plainly compose far more files and behaviours than one cycle can land green.

### Step A2: Read the Story

1. Open `.roll/backlog.md`, find the US row, follow the link to `.roll/features/<epic>/<story>/spec.md`
2. Read the full AC / Files / Dependencies section
3. If a plan doc (`<feature>-plan.md`) exists, read it for context
4. **Read the Evaluation contract (US-SKILL-030)**: if the spec contains an `**Evaluation contract:**` block, read `expected_evidence` and `scorer_focus` before writing any code. This is the Designer's artifact contract — use it to inform test design and evidence planning. Map each `expected_evidence` item to a candidate Action or test; if an item is impossible given the actual scope, note the deviation in your report/ac-map. `builder_notes` carry Designer hints — treat them as bounded guidance, not hidden requirements.

### Step A3: Split into Actions

- Write 2–6 candidate Actions
- Pick the smallest shippable Action first
- **Granularity constraint**: Each Action completable in 2–5 minutes; split if larger
- **No placeholders**: Action descriptions must be specific and directly executable
- **Test-quality self-check (US-QA-011)** — for every Action that adds tests:
  1. Tests call project functions / public command entry points; do NOT inline
     external-tool behaviour (`sed`/`awk`/`grep`/`find`/`cut` pipelines that
     duplicate logic already in `lib/` or `bin/`) — rubric ❼.
  2. Tests sandbox filesystem state via `BATS_TMPDIR` (or equivalent); do NOT
     touch or assert on paths outside this repo (`~/.codex`, `~/.kimi`,
     `~/.roll/`, `/etc/...`) — rubric ❽.
  3. If you can't satisfy (1) or (2), reshape the Action: extract a project
     helper, redirect the env var to a tmp dir, or move the test to an
     integration tier where the boundary is intentional and documented.

#### A3.1 Parallel Dispatch (auto-determined)

After splitting Actions, check if they can run in parallel:

```
Conflict detection:
  ├── List files involved in each Action
  ├── Same file → cannot parallelize, must run sequentially
  ├── Same directory, different files → can parallelize
  └── Different directories → safe to parallelize
```

**If 2+ Actions can run in parallel, automatically enable Worktree isolation:**

```bash
git worktree add .worktrees/{action-id} -b dispatch/{action-id}
```

- Each sub-agent executes TCR in its own worktree
- Sub-agent briefs must be **self-contained** (include: what to do, where, how to verify, what not to do)
- After all complete: review each → merge to main → run integration tests → clean up worktrees

**Status notifications (required):**

```
🔀 $(msg build.parallel_dispatch N)

  $(msg build.agent_running 1 "...")
  $(msg build.agent_running 2 "...")

  $(msg build.agent_done 1 "..." N)
  $(msg build.agent_done 2 "..." N)

🔀 $(msg build.merge_summary N N)
🧪 $(msg build.integration_tests)
```

When parallel conditions are not met, execute Actions sequentially.

### Step A4: Define Verification

- Test matrix: happy path + edge/failure/regression cases
- What "online verification" means for this repo (URL, endpoint, UI flow, log signal)
- Reference `$roll-.qa` for test pyramid (unit → E2E → visual → smoke)

#### A4.1 Testability routing (objective 4-stage vs subjective 3-stage)

Before defining the verification, classify **each Action** on one axis:

> **Can this Action's acceptance be expressed as deterministic pass/fail tests?**

```
Action acceptance
  ├── YES (deterministic) → objective 4-stage loop  ← DEFAULT
  │      Designer/AC contract → Tester (Phase 2 + write RED)
  │      → Builder (Phase 3 TCR) → Evaluator (Phase 6, incl. Agent 4 test audit)
  │
  └── NO (judgment-dependent) → subjective 3-stage loop
         Designer emits EXPLICIT evaluation criteria up front
         → Builder produces the output
         → an ISOLATED Evaluator scores the output against those criteria
```

Most code Actions are objective — the test IS the contract; stay on the default
path. Route to the 3-stage loop only for the genuinely judgment-dependent slices
that still ride inside a delivery: output-copy wording, layout / visual polish,
docs readability, recommendation quality. For those:

- **Write the criteria before building** — the same discipline as a test, but in
  prose: a short checklist of what "good" means for this Action (e.g. the Phase 11
  design-QA checklist is exactly such a criteria set for a visual surface).
- **Do not fake a test** to force the work onto the TCR path, and **do not let the
  building agent grade its own output** — that is the self-score red line (FIX-343).
- **An isolated Evaluator scores against the criteria** — a fresh session or
  `$roll-peer` (which already enforces the Independent Judgment Rule: the evaluator
  is not seeded with the builder's reasoning). Its verdict feeds the same
  fix-and-recheck loop as a failing test.

A single Story usually mixes both: the logic is objective (4-stage), while a copy
or readability slice inside it is subjective (3-stage). Classify per Action, not
per Story.

Proceed to the **Shared TCR Workflow** (Phase 1 onward).

---

## Mode B: Fly Mode (free-text or no-input)

Activate when input does not match any `US-XXX` / `FIX-XXX` pattern, or when no input is given.

### Step B1: Clarify & Assess

Before any code, assess clarity:

```
🎯 $(msg build.clarified_goal): {1-2 sentences capturing user intent}
📏 $(msg build.complexity_assessment): {small|medium|large}
🔍 $(msg build.uncertainty_areas): {list what needs investigation/decision}
```

**If uncertainty areas are non-empty or the request is vague, auto-trigger `$roll-.clarify`:**
- Output the clarification block above
- Follow with 3–5 targeted questions
- Stop and wait for user answers before proceeding

**Approach Confirmation (required for UX / format / automation decisions):**

If the request involves any of: output format, layout, automation level (manual vs automatic), or architecture structure — output a confirmation block **before writing any code**:

```
📐 $(msg build.approach_confirmation)

   1. $(msg build.what_changes): {what will be built or modified}
   2. $(msg build.the_approach): {specific format / automation level / structure chosen}
   3. $(msg build.files_touched): {list of files}

   Proceeding unless you say otherwise.
```

Wait for the user's response before editing files. If the user does not object within one exchange, proceed.

**Complexity Rules (AI coding time):**

| Level | Scope | Action |
|-------|-------|--------|
| Small | ≤3 files, 5–15 min, single concern | Skip detailed planning, implement directly |
| Medium | Crosses modules, needs trade-offs, 15–30 min | Mini-plan then implement |
| Large | Multi-step, architectural, 30–60 min+ | Full plan + split into Actions via `$roll-design` |

### Step B2: Create US / Actions

- Use `$roll-design` to split vague request into INVEST-compliant User Stories
- Insert US into `.roll/backlog.md` under the relevant Epic > Feature group
- If a new story folder is needed, mint it via `roll story new <ID> --title <t> --epic <e>` (the single channel, US-META-009), then edit the spec

After creation, switch to **Story mode** and execute the first US immediately.

Proceed to the **Shared TCR Workflow** (Phase 1 onward).

---

## Shared TCR Workflow

The following phases apply to both Story mode and Fly mode after planning is complete.

### Phase 1: Peer Review Gate

After planning is complete, before entering Test Design Review, assess whether the plan warrants peer review:

**Auto-trigger `$roll-peer` when any of the following is true:**
- Plan affects **>3 files** or **crosses modules**
- **Architecture decisions** or non-obvious trade-offs are involved
- **Destructive / irreversible operations** (deletions, migrations, production deploys)
- **High-risk signal words** detected in user request ("critical / important / don't break / 关键 / 别搞砸")
- User explicitly requests peer review ("/peer", "叫上 peer")

**With 10s opt-out:**
```
Plan affects N files across M modules. Estimated peer review: 2–3 rounds, ~X tokens.
Press Enter to launch peer review, or type 'n' to skip. Auto-executing in 10s...
```

**After peer review result:**
- **AGREE** → proceed to Phase 2 (Test Design Review)
- **REFINE** → incorporate feedback, regenerate plan, re-run Phase 1
- **OBJECT** → consider alternative plan, re-run Phase 1 with revised proposal
- **ESCALATE** → present both proposals to user for final decision before proceeding

**Never trigger:**
- Single-file changes or well-defined fixes
- Plans with no cross-module impact and no architecture decisions

### Phase 2: Test Design Review

Before writing implementation code:

```
🧪 $(msg build.test_design): {Action name}

   $(msg build.scenarios):
   ├── {Happy path scenario}
   ├── {Edge case scenario}
   └── {Failure/regression scenario}

   $(msg build.test_types):
   ├── Unit tests for: {logic components}
   ├── Integration tests for: {API/data flows}
   └── Manual verification for: {UI/visual elements}
```

**Self-review on test design:**
- Are we testing the right behavior?
- Are edge cases covered?
- Are tests independent and deterministic?

Reference `$roll-.qa` for coverage requirements and test pyramid strategy.

**Why this phase**: TCR only guarantees code passes tests — verify tests are correct first.

> This self-review is necessary but **not** sufficient: the same agent that
> wrote the tests judging its own tests is not isolation. It catches obvious
> gaps now; the *independent* adequacy audit (no implementation, no builder
> reasoning) happens at **Phase 6 Agent 4 — Test Adequacy Review**. Treat this
> step as "don't ship obviously-wrong tests," not as the final word on coverage.

### Phase 3: TCR Implementation Loop

```
┌────────────────────────────────────────────────────────────┐
│  $(msg build.tcr_cycle)                                      │
└────────────────────────────────────────────────────────────┘

$(msg build.micro_step {N} "{description of smallest testable change}")

   Step 1: Write/Update Test
      └── Run test → Confirm RED (expected failure)

   Step 2: Implement Minimal Code
      └── Write just enough to make test pass

   Step 3: TCR Decision
      └── roll test  (per-commit gate — AFFECTED scope only)
          ├── ✅ GREEN → git commit -m "tcr: {micro-step description}"
          └── ❌ RED   → git checkout -- .  → Retry with new approach

   Step 4: Refactor (optional, while green)
      └── roll test → ✅ GREEN → Amend or new TCR cycle
```

**The commit gate runs AFFECTED tests, not the full suite (FIX-325):**

- `roll test` (the per-commit gate) runs `vitest --changed` — only the
  dependency closure of the working-tree change — and **excludes** the
  env-divergent heavy suites (`*.integration.test.ts`, `*.e2e.test.ts`,
  `npm-pack.test.ts`) that are red locally / in a cycle worktree but green in
  CI. The FULL suite (`npm test`, no `--affected`) is the CI / pre-push gate
  (Phase 5), never the per-commit gate.
- On green, `roll test` writes the proof record `.roll/last-test-pass`
  (`{ts, tree, mode, scope}`). The `pre-commit` hook refuses the commit unless
  that proof is **fresh (≤ 60s)** AND its `tree` matches the current
  `git write-tree` — i.e. the exact code being committed was just tested. So:
  stage → `roll test` → commit, in that order; editing after the test
  invalidates the proof (commit blocked: "code changed since last test run").
  Doc-only changes are exempt.

**Micro-step guidelines:**

| Change Type | Typical Micro-Steps |
|-------------|---------------------|
| Logic / algorithm | 1 function = 1–2 micro-steps |
| API endpoint | Route → Handler → Validation → Response |
| UI component | Skeleton → Props → Interaction → Styling |
| Bug fix | Regression test → Fix → Verify |
| Refactor | Extract method → Update calls → Remove old |

Accumulate 3–5 micro-commits per Action. Each commit is a guaranteed working state.

#### Architectural Friction Signal (non-blocking)

While implementing, watch for these signals:

- This Action requires touching code in 3+ unrelated modules
- The existing module boundary has to be bent or bypassed to make this work
- A data structure or interface needs to change in a way that ripples across contexts
- The implementation feels "wrong" even when the test passes

When any signal appears, **do not stop — flag it**:

```bash
# 1. Append to .roll/backlog.md under ## ♻️ Refactor
# REFACTOR-XXX | <one-line description> | 📋 Todo

# 2. Append a brief entry to .roll/features/autonomous-evolution/refactor-log.md
```

**REFACTOR entry format in .roll/backlog.md:**

```markdown
| REFACTOR-001 | {one-line plain-language description} | 📋 Todo |
```

描述写法：参见 AGENTS.md "Backlog descriptions" 规则。说清楚"什么需要改"以及"不改会怎样"，技术细节写在 `.roll/features/<epic>/refactor-log.md`。

**refactor-log.md entry format:**

```markdown
## REFACTOR-001 Extract payment boundary

**Flagged**: {YYYY-MM-DD} during US-XXX
**Signal**: {which friction signal triggered this}
**Observation**: {1–3 sentences describing what felt wrong}
**Suggested scope**: {rough sense of what a fix would touch}
```

Then continue implementing the current Story normally.

**Event emission** — after all TCR micro-steps for a Story complete, emit a `build` event so the cycle event stream reflects the work done. The v3 runner writes events natively; do not call the retired bash helper `_loop_event`.

### Phase 4: E2E Deposit

After TCR micro-steps pass, deposit an E2E test for this Story's core user flow.

```
E2E DEPOSIT

   Step 1: Detect
      └── Read project's existing E2E infrastructure
          (test directories, config files, framework, naming conventions)

   Step 2: Write
      └── One E2E test covering the Story's golden path
          (the critical user journey this Story delivers)

   Step 3: Run
      └── Execute the new E2E test

   Step 4: TCR
      ├── ✅ GREEN → git commit -m "tcr: e2e deposit for {story}"
      └── ❌ RED   → Fix via TCR cycle until green
```

**Rules:**
- Follow whatever E2E patterns the project already uses — framework, directory, naming
- If no E2E infrastructure exists, reference `$roll-.qa` "Missing Test Infrastructure" section to bootstrap minimally, then deposit
- One test per Story — covers the golden path, not exhaustive edge cases (those are unit/integration from Phase 3)
- Each deposited E2E becomes a replayable case: CI runs it on every push, Sentinel can sample it against production

### Phase 5: Pre-Push CI Gate

After all micro-steps, run the **FULL** suite locally before pushing — this is
where the heavy env-divergent suites (integration / e2e / npm-pack) excluded
from the per-commit affected gate (Phase 3) finally run. This is the same scope
CI runs (`npm test` with no `--affected`), so a green here predicts a green CI.

```bash
npm run ci:local 2>/dev/null || (npm run lint && npm run build && npm test -- --run)
```

**If CI fails:**
```
❌ Local CI check failed
   ├── Run 'npm run ci:fix' or 'npm run format' for auto-fixable issues
   ├── Fix remaining lint/build/test errors via new TCR cycle
   └── Re-run until all pass
```

**Setup `ci:local` script (if not in `package.json`):**
```json
{
  "scripts": {
    "ci:local": "npm run format:check && npm run lint && npm run build && npm run test -- --run",
    "ci:fix":   "npm run format && npm run lint -- --fix"
  }
}
```

**Setup pre-push hook (recommended, one-time):**
```bash
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
echo "🔍 Running local CI checks..."
if ! npm run ci:local 2>/dev/null && ! (npm run lint && npm run build); then
    echo "❌ CI check failed, push blocked"
    exit 1
fi
echo "✅ CI check passed"
EOF
chmod +x .git/hooks/pre-push
```

### Phase 6: Pre-Push Code Review (Three-Axis Deep Review)

This phase runs **once per Story** (not per micro-step) on the full accumulated diff.
Per-micro-step review uses `$roll-.review staged` inline checklist (zero extra cost).

**Phase 1 vs Phase 6 split**: Phase 1 (Peer Review) focuses on architectural direction
and approach before coding begins. Phase 6 focuses on implementation quality after all
micro-steps are done — catching issues that only appear at diff scale (parameter sprawl
across files, copy-paste patterns, cross-file N+1, etc.).

```bash
# Capture full Story diff
git diff main...HEAD
```

**Launch four review agents in parallel:**

```
Agent 1: Reuse Review                 (receives: full diff)
  → Search for existing utilities / helpers the new code could use instead
  → Flag any new function that duplicates existing functionality
  → Flag inline logic replaceable by existing tools

Agent 2: Quality Review               (receives: full diff)
  → Redundant state, Parameter sprawl, Copy-paste near-duplicate,
     Leaky abstraction, Stringly-typed, JSX nesting,
     Nested conditionals ≥3 deep, Unnecessary comments

Agent 3: Efficiency Review            (receives: full diff)
  → Redundant computation / N+1, Missed concurrency,
     Hot-path bloat, Loop no-op updates, TOCTOU existence pre-check,
     Memory leaks, Overly broad operations

Agent 4: Test Adequacy Review         (receives: AC/contract + test files ONLY)
  → Audit the TESTS, not the implementation. This agent does NOT receive
     the implementation diff or any builder reasoning — only (a) the Story's
     AC / interface contract (the Designer artifact) and (b) the test files.
  → AC ↔ assertion coverage: every AC has at least one test that would fail
     if that AC regressed. Flag any AC with no corresponding assertion.
  → Tautological / vacuous assertions: tests that only assert "did not throw",
     re-assert the mock, or compare a value to itself — green but proves nothing.
  → Tests loosened to pass: an assertion weakened (widened matcher, deleted
     case, `.skip`, snapshot blindly updated) so a thin implementation goes green.
  → Missing edge / failure cases the AC names (boundaries, invalid input,
     concurrency, error paths) that have no test.
```

**Why Agent 4 is isolated (the test-gated-loop insight)**: in the TCR loop the
implementation is *already* constrained by the tests — a thin or wrong
implementation cannot stay green. The weakest link is therefore the **tests
themselves**, and Phase 2's test-design review is a *self*-review by the same
agent that wrote them (no isolation). Agent 4 closes that gap: a fresh,
context-isolated reviewer that sees only the contract and the tests audits
whether the tests actually pin the behavior the AC promises. Seeding it with the
implementation diff or the builder's reasoning would collapse the independence
(same red line as the FIX-343 Review Score and roll-peer's Independent Judgment
Rule) — so it is deliberately withheld.

Wait for all four agents to complete. Aggregate findings → fix each issue
(false positives: note and skip, no debate) → summarize what was fixed. A
genuine test-adequacy gap (uncovered AC, vacuous assertion) is fixed by a new
TCR cycle that adds the missing test FIRST (RED), never by relaxing the audit.

**Fallback**: If parallel agent invocation fails, run `$roll-.review staged` on
the full diff as a single-pass fallback — do not skip review entirely.

**Decision:**
```
🔴 Critical > 0 → Fix via new TCR cycle → Re-review
🟡 Warnings > 0 → Fix if quick (< 5 min) or document
🟢 Suggestions / ✅ All clear → Proceed to Phase 7
```

### Phase 7: Commit & Push (branch + PR — NEVER direct to main)

`main` is PR-protected. Push the worktree's branch and open a PR — never
`git push origin main`. (When invoked by `roll-loop`, the runner already
created the worktree + branch and opens the PR; this is the manual-path
equivalent.)

```bash
# All TCR micro-commits are already made on the worktree's branch (step A3.1).
git log --oneline -{n}                 # Review TCR commits
git push -u origin <branch>            # the dispatch/<id> branch from step A3.1
gh pr create --title "{story-id}: …" --body "…"
# After CI is green: gh pr merge --rebase
```

Commit message (if squashing):
```
{story-id}: {action description}

- {what changed}
- {why}
- {test coverage}
- TCR: {n} micro-commits
```

### Phase 8: Watch CI & Deploy

```
⏳ CI Running...
   ├── ✅ PASS → Proceed to deploy
   └── ❌ FAIL →
       ├── Diagnose failure
       ├── Create new TCR micro-step to fix
       └── Push and retry
```

Follow the repo's deployment path (Vercel / Railway / etc.) and record the deployed target.

**CI failure recovery:**
```
1. Diagnose: environment-specific or real failure?

2. If real failure:
   ├── git reset --soft HEAD~{n}
   ├── TCR micro-step to fix
   └── Push again

3. If environment-specific:
   ├── Document exception
   └── Get user approval to proceed
```

### Phase 9: Runtime Verification

- **Web apps**: verify on deployed URL (happy path, edge cases, no regression)
- **CLI tools**: verify via command execution
- **Libraries**: verify via test usage or example scripts

### Phase 10: Verification Gate (MANDATORY)

**Before marking as DONE, fresh evidence must be provided.**

```
🚦 $(msg build.verification_gate)

   $(msg build.evidence_checklist):
   ├── [ ] $(msg build.tests_passed)
   ├── [ ] $(msg build.build_succeeded)
   ├── [ ] $(msg build.online_verification)
   └── [ ] $(msg build.no_regression)

   $(msg build.gate_decision):
   ├── ✅ $(msg build.gate_pass)
   └── ❌ $(msg build.gate_fail)
```

**Hard Rule**: "I confirmed the tests passed" does not count as evidence. Must be **freshly run** command output from this session.

### Phase 11: Acceptance Evidence (after Gate PASS)

Runs ONLY on a ✅ Gate PASS (a FAIL retry must not mint a misleading report). Non-blocking: any failure here → WARN, continue to Phase 12.

**Attest is EARNED during delivery — never backfilled (FIX-329).** Acceptance
evidence is produced inside the delivery: under `roll-loop` the HARD
`attest:gate` renders the report in-cycle; on the manual path you run
`roll attest` here, in Phase 10.6 of this delivery. There is no after-the-fact
reconstruction — `roll attest backfill` was a loophole and has been **removed**
(it now hard-errors). A Done card with no in-delivery evidence cannot acquire a
report; the only way past the release consistency gate is to **re-deliver** the
story (loop or manual Phase 10.6) and earn the report at delivery time.

0. **Before/after pairing (owner ruling 2026-06-06)**: when the story CHANGES
   existing behavior, capture the prior state (`screenshots/before-*.png`)
   before building and the new state (`screenshots/after-*.png`) at acceptance —
   contrast is the clearest evidence. Brand-new capability with no prior state:
   skip the pair; capture the new surface only.

1. **Dump raw evidence** produced in this session to story-level dirs:
   `.roll/features/<epic>/{ID}/screenshots/*.png` — the DEFAULT evidence class for
   every surface, **CLI included** (US-ATTEST-010): text evidence is the agent's
   own report (nothing stops a fabricated `echo "✓ passed" > evidence.txt`); a
   screenshot is an OS-level capture of really-rendered pixels — an independent
   channel with a categorically higher forgery cost. Combined with the
   never-overwritten run dirs (D4) and the render-layer red line, it is the
   strongest link in the evidence chain.
   `.roll/features/<epic>/{ID}/evidence/*.txt` (resolve `<epic>` via `.roll/index.json`; `roll attest` writes the report there as `{ID}-report.html`) — supplementary (searchable,
   copyable); keep raw command outputs here, but do not let a text file be the
   ONLY evidence for an AC that has a visible surface.

   **CLI capture recipe**: run the verifying command in a REAL terminal (the
   tmux observation window `roll-loop-<slug>` is a natural target — display the
   proof there), then `screencapture -x -R <window-rect>` (macOS) into
   `screenshots/`. Capture ONLY the relevant work area — a focused window, not
   the whole desktop. Unattended cycles: drive the capture from the runner's
   capture lane (deterministic), never hand-craft an image; if the capture channel is
   unavailable (no GUI session / no permission), fall back to text evidence and
   mark the AC `partial` with a note — never fake a screenshot.

   **Web capture — shoot the DELIVERABLE, not the dossier (FIX-321/314)**: a web
   screenshot captures the card's **declared** deliverable, taken from the
   story's frontmatter key `deliverable_url` (alias `screenshot_url`). It may be
   a URL, a local file, or carry a `#fragment` to deep-link a specific tab/view
   (e.g. `https://app.example.test/casting#board`). The loop captures it with
   **headless Playwright** — no GUI browser window pops up, and a missing
   Chromium self-heals via an auto-install on first use. The red line: **never**
   screenshot roll's own attest report / dossier page and pass it off as the
   deliverable — that is a hollow shot. If the card declares **no**
   `deliverable_url`, the capture **honestly skips** (recorded as a real skip,
   not a fabricated image) — that is the correct behavior, not a failure. Declare
   `deliverable_url` in the spec frontmatter when the story ships a visible web
   surface so the real view gets captured.
2. **Write the intent map** `.roll/features/<epic>/{ID}/ac-map.json` — for EVERY AC (ids `{ID}:AC1..n`) pick `pass|readonly|partial|claimed|missing` and reference only evidence that exists (paths relative to the run dir; story-level dirs are reachable as `../evidence/...` / `../screenshots/...`):

```json
[{ "ac": "{ID}:AC1", "status": "pass",
   "evidence": [
     { "kind": "screenshot", "label": "terminal run (real pixels)", "href": "../screenshots/ac1-terminal.png" },
     { "kind": "text", "label": "vitest (supplementary)", "textFile": "../evidence/vitest.txt" }
   ] }]
```

   **Cross-reference with the Evaluation contract** (when present): each `expected_evidence` item in the contract maps to an AC via its `proves` field. When writing ac-map entries, ensure every `expected_evidence` item is addressed — the attest gate later surfaces a design-contract-vs-delivered delta from this mapping (US-SKILL-030).
   No evidence for an AC → say `claimed` yourself; the renderer enforces that downgrade anyway (red line) and lists it under Discrepancies.
3. **Run** `roll attest {ID}` (add `--deploy-url <url>` when one exists). The report lands at `.roll/features/<epic>/{ID}/latest/{ID}-report.html` (archive-per-card layout, US-META-001). The report is now layered (US-ATTEST-013): card context + conclusion/business badges + key screenshots up front, technical ANSI/command output folded into collapsed `<details>`, and a closing block (quality gate + evidence index + Review Score).
4. **Design QA checklist (US-ATTEST-013) — READABILITY ONLY**. After the report
   renders, open it and run the checklist below. This is a presentation review of
   the rendered HTML, NOT an evidence review.
   **HARD RULE: this checklist NEVER changes any AC's status, evidence, or
   `pass|readonly|partial|fail|blocked|claimed|missing` verdict.** Those are
   fixed at step 2 (the ac-map) and enforced by the render-layer red line. If a
   readability item fails, fix the *presentation* (a missing context field, an
   uncropped screenshot, a layout overflow) — never edit a verdict to make the
   report look cleaner.
   - [ ] **首屏 10s 可懂** — a product/business reviewer grasps what shipped and
     whether it passed within ten seconds, without scrolling into the technical fold.
   - [ ] **390 / 320px 无横滚** — no horizontal scroll at mobile widths; before/after
     pairs stack rather than overflow.
   - [ ] **打印可读** — print preview (or print-to-PDF) is legible; AC cards don't
     split awkwardly across pages.
   - [ ] **状态不只靠颜色** — every status reads from its icon + bilingual word, not
     color alone (colorblind-safe).
   - [ ] **截图裁切与清晰度** — screenshots are cropped to the relevant work area and
     legible; no full-desktop captures, no blurry/half-rendered frames.
   If you cannot open the report (headless cycle), note that the design QA was
   deferred and say so in the cycle report — do NOT silently skip it, and do NOT
   substitute it for an evidence judgement.

### Phase 12: Write Back Status (REQUIRED)

**Done ≡ merged (FIX-322/323).** A card is `✅ Done` only once its delivery is
**merged to `main`** — not when the branch is pushed and not while the PR is
merely open. `published_pending_merge` (pushed / PR open, awaiting merge) is
**not** delivered. Consequences you can rely on:

- The picker **skips** any card that already has a merged delivery, so a card
  reset to 📋 Todo after merge is not re-picked and re-built.
- Preflight reconciles truth from the PR: a 🔨 In Progress card whose PR has
  **MERGED** is flipped to ✅ Done automatically (an OPEN PR is left alone).

So on the manual path, flip the row to Done **after** the PR merges; under
`roll-loop` the runner waits for green CI, auto-merges, and the flip follows the
merge — do not pre-flip on a still-open PR.

Both locations must be updated — neither can be skipped:

**① Update .roll/backlog.md index row (Status column):**

**Location rule (FIX-198)**: edit the MAIN project's backlog by ABSOLUTE path — `${ROLL_MAIN_PROJECT:-$PWD}/.roll/backlog.md`. In ordinary projects the cycle worktree has NO `.roll/` (gitignored, never checked out): a relative `.roll/backlog.md` edit writes into the void and the flip silently vanishes.


```markdown
| [US-{ID}](.roll/features/<epic>/US-{ID}/spec.md) | {Title} | ✅ Done · [evidence](.roll/features/<epic>/US-{ID}/latest/US-{ID}-report.html) |
```

Change the Status from `📋 Todo` or `🔨 In Progress` (whichever the row currently shows) to `✅ Done`. When invoked by `roll-loop`, the row will already be `🔨 In Progress` — that is the expected starting state, and the transition is the same Edit operation.
For Fly mode: first append an index row under the appropriate Epic > Feature group, then mark it done.

**② Update `.roll/features/<epic>/<story>/spec.md`:**

```markdown
## US-{ID} {Story Title} ✅

**Completed**: {YYYY-MM-DD}

**AC:**
- [x] {Completed acceptance criterion 1}
- [x] {Completed acceptance criterion 2}

**Files:**
- `{added/modified file 1}`
- `{added/modified file 2}`
```

- Add ✅ to the heading
- Add `**Completed**` date
- Change AC items from `[ ]` to `[x]`
- Update Files to reflect actual changed files

If the US section does not yet exist, create the full section (AC / Files / Dependencies).

**Before committing, run `$roll-.changelog`** to stage CHANGELOG.md — then include
it in the completion commit so no separate changelog commit is created.

```bash
# 1. Stage changelog (roll-.changelog stages CHANGELOG.md only, does not commit)
$roll-.changelog

# 2. Commit BACKLOG + feature doc + CHANGELOG.md together
git add .roll/backlog.md .roll/features/ CHANGELOG.md
git commit -m "docs: mark {US-ID} as completed"
git push
```

### Phase 13: Report & Celebrate

```
✅ $(msg build.pushed_to)
🚀 $(msg build.deployed): <url>
✅ $(msg build.verified): <what was checked>
📦 $(msg build.changes_summary): <summary>
🔢 $(msg build.commits_count): <count> micro-commits via TCR
🧪 $(msg build.tests_added): <what tests were added/modified>
📊 $(msg build.tcr_stats): <success rate, revert count if any>
📋 $(msg build.review_gate): <self-review findings summary>
📝 $(msg build.backlog_updated "<US-ID>")
📄 $(msg build.changelog_bundled)

🎉 $(msg build.shipped)

🔄 $(msg build.next_options):
1. Continue to next Action (if Story has more)
2. Start next US (if Fly mode created multiple)
3. Done (if all completed)
```

---

## Project Context Rule

Before creating any file or directory:

1. **Read existing project structure** — check for `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, existing `src/`, `api/`, `cmd/` directories
2. **Infer conventions from evidence** — don't assume a project type; observe what already exists
3. **Follow what already exists** — introduce new patterns only when the current structure has no precedent

> `roll init` no longer asks for project type. Skills are responsible for reading context and acting accordingly.

---

## Hard Rules

0. **Worktree-first, PR-at-end (ALWAYS)**
   Before writing any code, work in a dedicated git worktree on its own
   branch (`git worktree add ../wt-<id> -b <branch>`), never in the shared
   checkout — so concurrent cycles / sessions never collide. Finish by
   pushing the branch and opening a PR; `main` is PR-protected — NEVER
   `git push origin main`. (Under `roll-loop` the runner creates the
   worktree + branch and opens the PR; this rule is the manual-path
   equivalent and must hold either way.)

1. **No local-only "done" — Done ≡ merged (FIX-322/323)**
   Work is not complete until it reaches:
   commit → push → CI signal → **PR merged to main** → deploy → online
   verification → backlog update.
   A pushed branch or an open PR is `published_pending_merge`, NOT delivered;
   the row flips to `✅ Done` only after the merge. Truth reconciles from the
   PR: the picker skips already-merged cards and preflight flips a MERGED PR's
   card to Done.

2. **TCR for every micro-step**
   - Each behavior change: Test → Green=Commit / Red=Revert
   - No "I'll fix it in the next step" — revert and retry
   - Each commit is a guaranteed working state

3. **Test Design Review before implementation**
   - Design test scenarios and edge cases first
   - TCR only works if tests are correct — validate early

4. **Micro-steps only**
   - If a step feels "a bit complex", split it
   - Each micro-step completable in 1–3 minutes
   - **No placeholders**: Action/AC descriptions must be specific — no "TBD"

5. **Pre-push self-review required**
   - Run `$roll-.review staged` on final diff
   - Fix blocking (Critical) issues via new TCR cycle

6. **No hidden work**
   - Every file changed must relate to the current Action
   - No "while I'm here" refactors unless in a separate TCR cycle

7. **Always update BACKLOG status**
   - .roll/backlog.md index row and `.roll/features/<feature>.md` US section are both required
   - Neither can be skipped

8. **Docs/code/product stay aligned**
   - User-visible behavior, command, output-copy, site, or delivery-view changes update the touched README/docs/guide/site/help in the same delivery
   - Registry drift from FIX-242 remains a hard red line; `roll attest` doc-gap is a shadow warning and should be resolved before Done

---

## Definition of Done (per Action)

- [ ] Story and Action clearly defined
- [ ] Test design reviewed and approved
- [ ] **TCR cycles completed** (all micro-steps via Test && Commit)
- [ ] **E2E deposited** (golden path test for this Story, committed via TCR)
- [ ] All commits are green states (no broken commits)
- [ ] Local CI checks passed (format + lint + build + test)
- [ ] **Docs/code/product aligned** (user-visible changes updated touched README/docs/guide/site/help, or the delivery records why no doc surface changed)
- [ ] Self-code-review passed, blocking issues fixed via TCR
- [ ] Changes pushed to remote
- [ ] CI is green (or explicit, recorded exception)
- [ ] Deployed to production
- [ ] Online verification performed
- [ ] **Verification Gate passed** (fresh evidence for tests, build, deploy, no regression)
- [ ] **.roll/backlog.md index status updated** (📋 → ✅, REQUIRED)
- [ ] **`.roll/features/<feature>.md` US section updated** (Completed date + [x] ACs, REQUIRED)
- [ ] **CHANGELOG.md staged and bundled** into completion commit via `$roll-.changelog` in Phase 12 (REQUIRED)
- [ ] Summary reported to user

### Review Score (FIX-343)

The story's Review Score is **not** produced by this skill. The building agent
**does NOT self-score**. The quality score is produced SOLELY by the runner's
peer score stage — a Reviewer running in a FRESH, separate session (never a
sub-agent of the builder's session). The agent's job is to deliver clean
evidence (report + ac-map + attest); the runner then casts a fresh-session
Reviewer that mints the Review Score (1..10 + verdict + rationale), recorded
with `scoredBy` and the fresh-session id so independence is verifiable.

Independence is about session/context, not vendor: a fresh same-vendor session
is the minimum acceptable; a different agent+model+session (non-sub-agent) is a
ranking preference unless the owner explicitly requested strict diversity. A
score sharing the builder's session (including any sub-agent of it) is rejected
as a self-score.

Score guidance the Reviewer applies (integer 1..10):
- **9..10** — story shipped cleanly: AC fully met, TCR rhythm tight, no
  re-tries from `verdict: too_big`, peer review concerns addressed inline.
- **6..8** — shipped with caveats: re-tries on red, edge case left to a
  follow-up FIX, documentation lagged behind code by one cycle, etc.
- **1..5** — shipped but at low confidence: AC partially met (note which),
  TCR rhythm broken (multiple revert iterations), or `regression` verdict.

Verdict values:
- `good` — story fully delivered; AC met; no concerning signal.
- `ok` — shipped but with at least one documented trade-off (use rationale).
- `regression` — story landed but another behaviour broke (rare; open a FIX).

#### Reviewer-triggered resize (US-AGENT-041)

A low score (≤ 5) can mean two different things, and the Reviewer distinguishes
them. When the delivery fell short because of a **quality** problem (a bug, a
weak test), the Reviewer just scores low — the loop retries. But when it fell
short because the **scope was simply too large for one cycle** (whole ACs or
surfaces left uncovered, not defects), the Reviewer ALSO emits, alongside the
SCORE/VERDICT/RATIONALE lines:

```
RESIZE: <one line — why the scope exceeds one cycle>
GAPS: <gap one; gap two; gap three>
```

On a RESIZE signal (low score), the loop runs `roll loop review-resize <story>`:
`$roll-design` mints sub-stories from the gaps, and ≥2 fresh-session reviewers
gate the split by consensus. Prefer diverse agents/models when available, but do
not block solely on matching brand/provider unless the owner requested strict
diversity. When all agree, auto-land via `roll loop self-downgrade`, which parks
the parent at 🚫 Hold + appends the sub-stories; any objection → pause + ALERT,
backlog unchanged. The chain-depth cap (US-AGENT-009) stops runaway splits. The
human is **on** the loop (alerted only on consensus failure
or the cap), not in it. A RESIZE is never emitted for a pure quality problem.

---

## Construction-time independence & shift-left evidence (US-SKILL-031/032/033)

The Review Score (FIX-343) and Phase 6 Agent 4 add independence *downstream* of a
single builder that wrote BOTH the tests and the implementation. These three
gates add independence and evidence freshness *during* construction. They were
distilled from the US-EVID-026 delivery retro.

### US-SKILL-031 — Adversarial pairing mode (verified / designed profiles)

Under the `verified` and `designed` execution profiles, the **test author and the
implementer are DIFFERENT, heterogeneous agents** — the agent that makes a test
pass is never the one that wrote it, so tests and implementation cannot be
co-shaped to be mutually flattering. **This is now orchestrated by the loop engine
itself** (US-LOOP-100..106), not left to builder self-discipline — the runner
spawns the roles and drives the rounds:

1. Test author writes a RED test for the next micro-step.
2. Implementer (a different agent) writes ONLY production code to turn it green;
   it must not edit the test.
3. **Attack round** — once green, the test author writes ≥1 *breaking* test
   targeting an untested failure mode; the implementer fixes; repeat until the
   attacker is dry (N consecutive rounds surface no new hole).
4. The attacker's breaking tests are added to the Phase 6 **Agent 4** test-audit
   input, so "these failure modes are now pinned" is auditable.

How the engine runs it (all in `@roll/core` + the CLI runner, not a prose
convention):

- **Sequencing** — the orchestrator's execute phase emits a `spawn_role`
  subsequence (`test_author → implementer → attack rounds`) instead of a single
  `spawn_agent`, driven by the pure `adversarialNextStep` termination algorithm
  (three independent stops — dry streak > max rounds > total timeout — so it can
  **never hang unattended**). `standard` cycles still emit the single builder,
  byte-unchanged.
- **Fail-closed degrade** — any adversarial exception (no heterogeneous partner,
  an unavailable agent, a hung round) routes through `adversarialDegradeDecision`
  and falls back to a standard single builder that completes the card, emitting an
  `adversarial:degraded` event — **never silent, never deadlock**. The role spawns
  carry the same main-checkout write-protection as the builder.
- **Observability** — each cycle's outcome (`rounds / holesFound /
  terminationReason / degraded`) is folded onto the runs row, and
  `roll loop adversarial` prints the read-only shadow-run aggregate (adversarial
  vs standard cohort, avg holes, degrade rate) so profile expansion is a
  data-backed decision (design §9), not a guess.

Cost: this approximately 2–3× the agent calls, so it is **bound to `verified` /
`designed`** (high-stakes cards). `standard` keeps the single-builder + downstream
audit unchanged. The profile choice is recorded (which was picked, and why).
Independence is by session/context, not vendor (same FIX-343 red line): the
test-author session must not be the implementer's session or a sub-agent of it.
The adversarial path is **dormant until a project opts into the verified/designed
execution profile** (`execution_policy.mode`); a standard-mode project is unaffected.

### US-SKILL-032 — Independent heterogeneous code review

Phase 6's code review is performed by a **randomly-picked independent
heterogeneous agent** (e.g. pi / kimi), NOT a sub-agent of the builder's session,
and it emits a **structured verdict** — PASS/FAIL per AC plus a blocking-issue
list — recorded with `reviewedBy` + session id so independence is verifiable (the
same `scoredBy` contract as the Review Score). Independence is by session/context,
not vendor. If no heterogeneous agent is available, fall back to `$roll-.review
staged`, but **record the independence degradation explicitly** — never silently
present a self-review as independent. This never becomes a hard block; its output
feeds the existing fix-and-recheck loop.

### US-SKILL-033 — Shift-left per-AC evidence

Each AC's evidence is captured **at the moment that AC's TCR turns green** — fresh
and bound to the micro-step — not batched at Phase 11. Phase 11 therefore
DOWNGRADES from "collect evidence" to "**summarize already-captured evidence +
generate the ac-map + render the report**"; an AC that reaches Phase 11 with no
captured evidence is a **red flag** (its TCR never captured), not an invitation to
now-collect. This is fully consistent with FIX-329 ("attest is earned during
delivery, never backfilled") — it only moves the earning point earlier, from
Phase 11 to the per-AC micro-step. Captured-artifact binding stays harness-owned
(US-EVID-023); this governs the *timing* of non-captured evidence (command output,
named tests).

---

## TCR Recovery Patterns

### Pattern 1: Red After Multiple Attempts

```
If same micro-step fails 3 times:
   1. Revert to clean state
   2. Escalate: "This micro-step is actually medium complexity"
   3. Split into smaller micro-steps
   4. Retry TCR
```

### Pattern 2: Refactoring While Green

```
If refactoring during green state:
   Option A: Amend last commit (if refactor is tiny)
   Option B: New TCR cycle (treat as new micro-step)
```

### Pattern 3: Test Design Was Wrong

```
If implementation reveals test design flaw:
   1. Revert current micro-step
   2. Return to Phase 2 (Test Design Review)
   3. Update test design
   4. Resume TCR cycles
```

### Pattern 4: Complex State vs Simple Reset

```
When complex state management is error-prone → consider full reset + re-initialization.
60% less code, zero bugs is better than an elegant but fragile transition.
```

---

## When to Use What

```
roll-build   → ship anything (new idea, US-ID, free-text request)
roll-fix     → fix a specific known bug (FIX-XXX / BUG-XXX)
roll-design  → plan and design before building (no code output)
roll-idea    → fast capture a bug or idea into .roll/backlog.md
roll-.clarify → passive scope clarification for vague build requests
```

---

## Required Artifacts (per Action)

The agent must explicitly produce (in text) before or during execution:

- **Current User Story**: 1–3 sentences, INVEST-lean
- **Current Action**: smallest shippable increment
- **Acceptance criteria**: measurable outcomes for this Action
- **Write scope**: files/areas expected to change
- **Test Design**: scenarios, edge cases, test types
- **Test Design Review**: coverage validation result
- **TCR Log**: micro-step descriptions and commit count
- **E2E Deposit**: golden path E2E test file for this Story
- **Quality Review**: post-TCR code review result
- **Deployment target**: where it will be verified
