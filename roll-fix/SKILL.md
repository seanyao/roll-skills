---
name: roll-fix
license: MIT
allowed-tools: "Read, Edit, Write, Glob, Grep, Bash, Skill"
description: Execute bugfix/hotfix from backlog. Reads FIX/BUG from .roll/backlog.md, delivers via TCR workflow. Lighter than roll-build, focused on single-issue fixes.
---

# Fix Ship (TCR Edition)

> Follows the Architecture Constraints, Development Discipline, and Engineering Common Sense defined in the project AGENTS.md.

Execute a single `FIX-XXX` / `BUG-XXX`, suitable for small-scope fixes or hotfixes.

## Trigger

Use when:

- There is a clearly defined `FIX-XXX` or `BUG-XXX`
- It is a single issue, single hotfix, or single small enhancement
- It does not need to be split into multiple Stories / Actions to deliver

**Workflow:**
1. Read .roll/backlog.md index → Find FIX/BUG row → Follow link to `.roll/features/<feature>.md`
2. Single Action (no splitting)
3. Execute via TCR workflow
4. Write back: update .roll/backlog.md status column + update FIX section in Feature file

Do not use for:

- Multi-step feature development
- Large changes spanning multiple subsystems
- Requirements that need planning and splitting first
- Roadmap work that should be tracked as Stories

If the issue expands beyond a single bounded change, switch to `roll-build`.

## Project Context Rule

Before creating any file or directory:

1. **Read existing project structure** — check for `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, existing `src/`, `api/`, `cmd/` directories
2. **Infer conventions from evidence** — don't assume a project type; observe what already exists
3. **Follow what already exists** — introduce new patterns only when the current structure has no precedent

> `roll init` no longer asks for project type. Skills are responsible for reading context and acting accordingly.

---

## Hard Rules

1. **No local-only "done"**
   Even for a minor change, the work is not complete until it reaches:
   - TCR micro-commits (test-guaranteed working states)
   - local verification
   - Quality review (post-TCR, via code-reviewer skill)
   - commit
   - push
   - CI signal
   - deploy
   - online verification

2. **Keep it to one issue**
   This skill is for one user-visible issue, one hotfix, or one tightly related enhancement bundle.

3. **Test Design Review first**
   - Design the test/verification approach before implementation
   - Run `code-reviewer` on test design for coverage validation
   - Ensure we're testing the right thing before TCR begins

4. **TCR for all changes**
   - Follow Test → Green=Commit / Red=Revert for each micro-step
   - Even "one-liner" fixes get a TCR cycle
   - Each commit is a guaranteed working state

5. **Quality Review before final commit** (Post-TCR)
   After TCR cycles complete:
   - Run `code-reviewer` skill on the diff
   - Review focuses on **quality** (naming, patterns, scope)
   - Correctness already guaranteed by TCR
   - blocking findings (Critical issues) must be fixed via new TCR cycle

6. **Do not force backlog churn**
   By default, do not update backlog or project status files.
   Only write back project tracking if:
   - the user asked for it
   - the change affects roadmap-visible behavior
   - the fix should be tracked for follow-up work

## TCR Workflow

### 0. Pre-flight self-check (US-AGENT-007)

Before locking the issue, read the FIX's Agent profile (est_min / chain_depth) from the linked feature md and decide whether this cycle should attempt the fix:

```
inputs:
  fix.est_min       (from **Agent profile:** block on the FIX row's feature md)
  fix.chain_depth   (0 unless already a downgrade product)

verdict:
  too_big when:
    fix.est_min > 20   (lands in the `hard` complexity tier)
  ok otherwise
```

Routing is a single axis now (US-AGENT-022): `est_min` maps to one of three
complexity tiers — `easy` (≤8), `default` (8<x≤20), `hard` (>20) — and each
tier binds to a locally-installed agent slot in `.roll/agents.yaml` (model =
the agent's own default; a `fallback` slot mechanically covers an unavailable
agent). The retired v1 model (three-dimension type/est/risk_zone matching
against `agent-routes.yaml`, soft history hit-rate preference, per-agent
`max_est_min`/`risk`) no longer applies. The pre-flight verdict here is just
the `hard`-tier boundary: a FIX estimated past it is a sanity signal that the
"single small fix" assumption may be wrong.

Emit `verdict: ok` or `verdict: too_big` (with `reason:`) as the first cycle output line.

- `ok` → continue with step 1 below normally
- `too_big` → self-downgrade per US-AGENT-008, **gated by US-AGENT-009 cap check**:

```bash
# Cap check first (chain_depth ≥ 2 → refuse third auto-split).
if ! bash -c 'source "$(command -v roll)"; _loop_chain_depth_cap_check FIX-XXX-NNN'; then
  bash -c 'source "$(command -v roll)"; _loop_split_cap_hit FIX-XXX-NNN "depth >= 2"'
  exit 0
fi
Skill("roll-design", "--from-story FIX-XXX-NNN")
bash -c 'source "$(command -v roll)"; _loop_self_downgrade FIX-XXX-NNN "too_big: <reason>" "FIX-XXX-NNNa,FIX-XXX-NNNb"'
exit 0
```

Original FIX goes to 🚫 Hold with `→ split to ...` annotation; sub-stories carry `chain_depth + 1`. Cap-hit path raises ALERT for human triage. Do NOT TCR a half fix.

Bug fixes are usually small (est_min ≤ 5), so pre-flight is mostly a sanity barrier for FIXes whose underlying issue turns out structural — e.g. a "simple null check" that requires touching 12 files. Catching that upfront is cheaper than burning a cycle.

### 1. Lock the issue
   - state the user-visible issue or requested enhancement
   - define the scope boundary and non-goals

### 2. Define verification
   - pick the narrowest local check that proves the fix
   - define the online verification target
   - for hotfixes: include regression test to prevent recurrence
   - reference `$roll-.qa` for appropriate test type (unit/integration/E2E)
   - **Test-quality self-check (US-QA-011)** — for any new test the fix adds:
     1. The test must call project functions / public command entry points,
        not inline `sed`/`awk`/`grep -o`/`find`/`cut` pipelines that
        re-implement what `lib/` or `bin/` already does — rubric ❼.
     2. The test must sandbox filesystem state via `BATS_TMPDIR` or an
        equivalent helper; never assert on or write to paths outside this
        repo (`~/.codex`, `~/.kimi`, `~/.roll/`, system paths) — rubric ❽.
     3. If you can't satisfy (1) or (2), extract a project helper or
        redirect the env var to a tmp dir before writing the test.

### 3. Test Design Review (TCR Core)

```
🧪 $(msg fix.test_design):
   
   $(msg fix.verification_approach): {unit test | integration test | manual check}
   
   $(msg fix.test_scenarios):
   ├── $(msg fix.fix_verification): {how to confirm the fix works}
   └── $(msg fix.regression_check): {how to ensure we didn't break anything}
```

**Reference `$roll-.qa` for test strategy:**
- Even for fixes, follow `$roll-.qa` test pyramid
- Hotfixes may skip visual regression but must have E2E smoke test

**Run self-review on test design:**
- Is the verification approach appropriate for this fix?
- Are edge cases covered?
- Is the regression check sufficient?

### 4. TCR Implementation

```
┌─────────────────────────────────────────────────────────────────────┐
│ $(msg fix.tcr_cycle)                                                 │
└─────────────────────────────────────────────────────────────────────┘

$(msg fix.micro_step 1 "{description of the fix}")

   Step 1: Write/Update Test
      └── Run test → Confirm RED (bug reproduced or test fails)
   
   Step 2: Implement Fix
      └── Write minimal code to fix the issue
   
   Step 3: TCR Decision
      └── Run test
          ├── ✅ GREEN → git commit -m "tcr: fix {issue description}"
          └── ❌ RED   → git checkout -- . → Retry

For simple fixes, this may be a single TCR cycle.
For complex fixes, use multiple micro-steps.
```

### 5. Local integration check (Pre-Push CI Gate)

Run the repo's full CI check locally to catch issues before push:

```bash
# Run local CI (format + lint + build + test)
npm run ci:local 2>/dev/null || (npm run lint && npm run build && npm test -- --run)
```

**Reference `$roll-.qa` for coverage requirements:**
- Fixes must not reduce overall coverage
- Hotfixes need at least regression test coverage

**If failures:**
```
❌ Local CI check failed
   ├── Run 'npm run ci:fix' to auto-fix formatting issues
   ├── Fix lint/build/test errors
   └── Re-run checks until passing
```

**Setup ci:local script (if not exists):**
Add to `package.json`:
```json
{
  "scripts": {
    "ci:local": "npm run format:check && npm run lint && npm run build && npm run test -- --run",
    "ci:fix": "npm run format && npm run lint -- --fix"
  }
}
```

**Setup pre-push hook (optional but recommended):**
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

### 6. Quality Review (Post-TCR)

**Run self-code-review on staged changes:**

```bash
$roll-.review staged
```

**Review Output:**
```
🔍 $(msg fix.self_review)
├── $(msg fix.scope): X files (+Y/-Z lines)
├── 🔴 $(msg fix.critical): N issues (must fix)
├── 🟡 $(msg fix.warnings): N issues (should fix)
├── 🟢 $(msg fix.suggestions): N items (optional)
└── ✅ $(msg fix.passed_dimensions): [...]
```

**Review Dimensions** (correctness guaranteed by TCR):
- 🎯 **Code Quality**: Naming clarity, KISS, readability
- 📐 **Design**: Appropriate abstraction, codebase consistency
- ⚠️ **Scope**: Fix is minimal, no opportunistic changes
- 📝 **Hotfix-specific**: Root cause addressed

**Decision:**
```
🔴 Critical > 0 → Fix via new TCR cycle → Re-review
🟡 Warnings > 0 → Fix if quick or document
🟢/✅ All clear → Proceed to push
```

**Note:** `code-reviewer` placeholder replaced with `$roll-.review` for local execution.

### 7. Commit and push

```bash
# TCR commits already made during implementation
# May squash or keep micro-commits based on repo convention

git pull origin main --rebase
git push origin main
```

Commit message:
```
{fix|hotfix|feat}: {description}

- {what was fixed}
- {root cause if known}
- {test coverage}
```

### 8. Watch CI and resolve

```
⏳ CI Running...
   ├── ✅ PASS → Proceed to deploy
   └── ❌ FAIL → 
       ├── Diagnose
       ├── TCR cycle to fix
       └── Push and retry
```

### 9. Deploy

Follow the repo's normal deployment path.

### 10. Online verification

Verify the shipped fix on the deployed target:
- confirm the issue is resolved
- confirm the previously working path still works
- for hotfixes: verify in production environment

### 10.5. Verification Gate (MANDATORY)

**Before marking as DONE, the verification gate must be passed.**

**Fresh evidence** must be provided — claiming completion based on assumptions is not acceptable.

```
🚦 $(msg build.verification_gate)
   
   $(msg build.evidence_checklist):
   ├── [ ] $(msg build.tests_passed)
   ├── [ ] $(msg build.build_succeeded)
   ├── [ ] $(msg fix.issue_resolved): screenshot / curl output / log excerpt as proof
   └── [ ] $(msg build.no_regression)
   
   $(msg build.gate_decision):
   ├── ✅ $(msg build.gate_pass)
   └── ❌ $(msg build.gate_fail)
```

**Hard Rule**: "I confirm tests passed" does not count as evidence. It must be **freshly run** command output from this session.

### 10.6: Acceptance Evidence (after Gate PASS)

Runs ONLY on a ✅ Gate PASS (a FAIL retry must not mint a misleading report). Non-blocking: any failure here → WARN, continue to Step 11.

0. **Before/after pairing (owner ruling 2026-06-06)**: for a FIX, capture the
   BROKEN state at reproduction time (screenshot when the surface is visible —
   terminal run, panel, page) into `screenshots/before-*.png`; after the fix
   passes, capture the SAME surface into `screenshots/after-*.png`. The pair is
   the strongest possible fix evidence — reviewers see the delta, not a claim.
   Behavior-changing stories: same pattern where a prior state exists.
   Brand-new capability with nothing to contrast: skip — never stage a fake
   "before".

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
   the whole desktop. Unattended cycles: drive the capture from the dispatcher
   (deterministic), never hand-craft an image; if the capture channel is
   unavailable (no GUI session / no permission), fall back to text evidence and
   mark the AC `partial` with a note — never fake a screenshot.
2. **Write the intent map** `.roll/features/<epic>/{ID}/ac-map.json` — for EVERY AC (ids `{ID}:AC1..n`) pick `pass|readonly|partial|claimed|missing` and reference only evidence that exists (paths relative to the run dir; story-level dirs are reachable as `../evidence/...` / `../screenshots/...`):

```json
[{ "ac": "{ID}:AC1", "status": "pass",
   "evidence": [
     { "kind": "screenshot", "label": "terminal run (real pixels)", "href": "../screenshots/ac1-terminal.png" },
     { "kind": "text", "label": "vitest (supplementary)", "textFile": "../evidence/vitest.txt" }
   ] }]
```

   No evidence for an AC → say `claimed` yourself; the renderer enforces that downgrade anyway (red line) and lists it under Discrepancies.
3. **Run** `roll attest {ID}` (add `--deploy-url <url>` when one exists). The report lands at `.roll/features/<epic>/{ID}/latest/{ID}-report.html` (archive-per-card layout, US-META-001). The report is now layered (US-ATTEST-013): card context + conclusion/business badges + key screenshots up front, technical ANSI/command output folded into collapsed `<details>`, and a closing block (quality gate + evidence index + self-score). A FIX usually carries a before/after pair (`screenshots/before-*.png` + `after-*.png`) — the坏态/好态 contrast is the clearest proof a bug is gone.
4. **Design QA checklist (US-ATTEST-013) — READABILITY ONLY**. After the report
   renders, open it and run the checklist below. This is a presentation review of
   the rendered HTML, NOT an evidence review.
   **HARD RULE: this checklist NEVER changes any AC's status, evidence, or
   `pass|readonly|partial|fail|blocked|claimed|missing` verdict.** Those are
   fixed at step 2 (the ac-map) and enforced by the render-layer red line. If a
   readability item fails, fix the *presentation* (a missing context field, an
   uncropped screenshot, a layout overflow) — never edit a verdict to make the
   report look cleaner.
   - [ ] **首屏 10s 可懂** — a reviewer grasps what was fixed and whether it passed
     within ten seconds, without scrolling into the technical fold.
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

### 11. Write Back Status (when tracking is needed)

Only update when Hard Rule #6 conditions are met (user requested, affects roadmap-visible behavior, or needs follow-up tracking).

Both locations must be updated — neither can be skipped:

**① Update .roll/backlog.md index row (Status column):**

**Location rule (FIX-198)**: edit the MAIN project's backlog by ABSOLUTE path — `${ROLL_MAIN_PROJECT:-$PWD}/.roll/backlog.md`. In ordinary projects the cycle worktree has NO `.roll/` (gitignored, never checked out): a relative `.roll/backlog.md` edit writes into the void and the flip silently vanishes.


```markdown
| [FIX-{ID}](.roll/features/<feature>.md#fix-{id}) | {Title} | ✅ Done · [evidence](.roll/verification/FIX-{ID}/latest/report.html) |
```

Change the Status of the corresponding row from `📋 Todo` or `🔨 In Progress` (whichever the row currently shows) to `✅ Done`. When invoked by `roll-loop`, the row will already be `🔨 In Progress` — that is the expected starting state.

**② Update `.roll/features/<feature>.md` FIX section:**

```markdown
## FIX-{ID} {description} ✅

**Fixed**: {YYYY-MM-DD}

**Problem**: {problem description}
**Root Cause**: {root cause}
**Solution**: {solution}

**Files:**
- `{modified file}`
```

- Add ✅ to the title
- Add `**Fixed**` date
- Change AC (if any) from `[ ]` to `[x]`
- Update Files to reflect actual changed files

### 12. Update Changelog

**Mandatory** — the release (GitHub Release body = this version's changelog section) depends on this step. Do not skip.

```bash
$roll-.changelog
```

### 13. Report

Summarize:
- shipped fix/enhancement
- TCR statistics
- quality review outcome
- verification results
- any residual risk
- **.roll/backlog.md updated** ✅
- **CHANGELOG.md updated** ✅

## Required Artifacts

The agent must explicitly output before or during execution:

- **Current Issue**: one sentence describing the bug, hotfix, or small enhancement
- **Current Fix**: the smallest shippable fix
- **Acceptance criteria**: measurable outcomes
- **Write scope**: expected files or areas
- **Test Design**: verification approach and scenarios
- **Test Design Review**: coverage validation
- **TCR Log**: micro-step(s) and commit(s)
- **Quality Review**: post-TCR review results
- **Deployment target**: where it will be verified

## Definition of Done

A minor change is only "done" when all are true:

- [ ] Issue clearly defined and scoped
- [ ] Test design reviewed and approved
- [ ] **TCR cycle(s) completed** (fix via Test && Commit)
- [ ] All commits are green states
- [ ] Local integration checks pass
- [ ] Quality review (code-reviewer) passed, blocking issues resolved via TCR
- [ ] Changes pushed
- [ ] CI is green (or explicit, recorded exception exists)
- [ ] Deployment completed
- [ ] Online verification performed
- [ ] **Verification Gate passed** (fresh evidence for tests, build, fix confirmation, no regression)
- [ ] **Self-score note written (US-SKILL-010 / 011)** — before exit, the agent
      writes a structured score note via `_skill_write_self_score` so trend
      analysis (US-SKILL-014) and skill-self-scoring docs (US-SKILL-015) have
      data to read.

### Self-score (US-SKILL-011)

Before exiting the cycle, write one self-score note. The helper validates
inputs and lands the note under `.roll/notes/<date>-roll-fix-<FIX-id>-<epoch>.md`:

```bash
bash -c 'source "$(command -v roll)"; \
  _skill_write_self_score roll-fix FIX-XXX-NNN <score 1..10> <good|ok|regression> "<rationale>"'
```

Score guidance (integer 1..10):
- **9..10** — clean root-cause fix; regression test added; TCR cycle smooth.
- **6..8** — fix shipped but with caveats (e.g. workaround, partial coverage,
  or repeated TCR red iterations); rationale explains the trade-off.
- **1..5** — fix landed but quality is below the bar (test coverage missing,
  fix only narrows blast radius, repeated agent re-tries). Verdict should be
  `ok` or `regression` if a related test broke.

Verdict values:
- `good` — fix is the proper root-cause fix; no caveats.
- `ok` — shipped but with documented trade-offs (use rationale to explain).
- `regression` — the fix re-broke something else (rare; consider re-opening).

## Rubric

Quality evaluation for a completed fix. Score each dimension independently.

| 维度 | ❌ Miss (0) | ⚠️ Partial (1) | ✅ Hit (2) |
|------|------------|----------------|-----------|
| **根因定位** | 只修了表象，未说明根因 | 描述了直接原因 | 追溯根本原因并有代码/日志证据 |
| **最小范围** | 改动超出 fix 边界，含机会主义修改 | 范围合理但有冗余改动 | 最小改动，非 fix 相关代码零触碰 |
| **回归测试** | 无测试，或测试与 bug 无关 | 有测试但未复现原始 bug | 先写复现测试（RED）再修复（GREEN） |
| **验证证据** | 仅声称通过，无实际输出 | 有部分截图/日志但不完整 | 贴出完整命令输出，覆盖 fix + 回归 |
| **无新破坏** | CI 红，或已知回归未处理 | CI 绿但有 warning 未说明 | CI 全绿，覆盖率不降，warning 清零 |

**评分解读**

| 总分 | 结论 |
|------|------|
| 9–10 | Exemplary — 可作为参考案例 |
| 7–8 | Acceptable — 可交付，有小瑕疵 |
| 5–6 | Needs Work — 需补充证据或补测试 |
| ≤ 4 | Redo — 根因或验证存在根本缺失 |

> 用法：fix 完成后由 `$roll-eval`（或人工）对照此表打分，结果写入 `roll-notes`。

---

## TCR Patterns for Common Fixes

### Pattern: Bug Fix with Regression Test

```
Issue: "Search returns no results for special characters"

🧪 Test Design:
   ├── Fix verification: Search with "@#$%" returns results
   └── Regression: Normal search still works

TCR CYCLE 1: Regression test
   ├── Write test: Normal search works
   ├── Run → ✅ GREEN (expected, feature currently works)
   └── Commit: "tcr: add regression test for normal search"

TCR CYCLE 2: Bug reproduction
   ├── Write test: Special character search works
   ├── Run → ❌ RED (bug reproduced)
   └── No commit (test fails, but we keep it)

TCR CYCLE 3: Fix implementation
   ├── Fix special character handling in search query
   ├── Run tests → ✅ GREEN (both tests pass)
   └── Commit: "tcr: fix special character handling in search"
```

### Pattern: One-Liner Fix

```
Issue: "Button color is wrong"

🧪 Test Design:
   └── Verification: Visual check + CSS property assertion

TCR CYCLE:
   ├── Test: CSS property assertion
   ├── Run → ❌ RED
   ├── Fix: Change color value
   ├── Run → ✅ GREEN
   └── Commit: "tcr: fix button color"
```

### Pattern: Hotfix (Production Issue)

```
Issue: "Critical: Payment processing fails"

🧪 Test Design:
   ├── Fix verification: Payment API returns 200
   └── Regression: Invalid payments still rejected

TCR CYCLE 1: Regression test for invalid payments
   └── Commit: "tcr: ensure invalid payments are rejected"

TCR CYCLE 2: Fix payment processing
   └── Commit: "tcr: hotfix payment processing failure"

🔍 Quality Review (extra scrutiny for hotfix):
   ├── Is this the minimal safe fix?
   ├── Is there a safer workaround?
   └── Should we roll back instead?
```

## Escalation Rule

Switch from `minor-ship` to `story-ship` when:

- the issue turns into multiple shippable Actions
- the change touches multiple domains or risky integrations
- project tracking and backlog state now matter
- the user asks for a full story-driven loop

## TCR Recovery

If TCR repeatedly fails (3+ attempts on same micro-step):

```
1. Revert to clean state
2. Re-examine: Is this really a "minor" fix?
3. If not → Escalate to story-ship
4. If yes → Break into smaller micro-steps
```
