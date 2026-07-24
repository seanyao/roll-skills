---
name: roll-propose
license: MIT
allowed-tools: "Read, Glob, Grep, Write, Bash(git:*)"
description: "Load when the owner asks for product proposal drafts from project context that should go to .roll/proposals.md, not directly into backlog."
workspace-execution-handoff: required
workspace-context-scope: workspace_required_mutation
workspace-context-consumer: workspace
workspace-context-operations: propose
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# roll-propose

Every relative `.roll` path in this carrier resolves from `context.authorities` and is never joined to cwd.

## Gotchas

- Proposals go to .roll/proposals.md for review; never write them directly into BACKLOG.
- Keep product scenarios user-facing rather than turning every code smell into a feature proposal.

> Follows the Architecture Constraints, Development Discipline, and Engineering
> Common Sense defined in the project AGENTS.md.

Human-triggered skill for product-level feature ideation. Generates structured
User Story drafts from a product/user perspective and queues them in
.roll/proposals.md for human approval before entering BACKLOG.

## Distinct from roll-.dream

| | roll-propose | roll-.dream |
|---|---|---|
| Triggered by | Human explicitly | Nightly schedule |
| Perspective | User-facing / product scenarios | Code health / technical debt |
| Output | .roll/proposals.md (pending approval) | BACKLOG (REFACTOR-XXX) |
| Thinking style | "What would users want next?" | "What is the code telling us?" |

## When to Use

```
$roll-propose                   # generate proposals from full context
$roll-propose 用户反馈里提到了XX  # provide a focus hint
```

## When Not to Use

- Describing a known defect or broken behavior (use `$roll-idea`)
- A story is already well-defined and ready to build (use `$roll-build`)
- Exploring technical architecture or design (use `$roll-design`)
- Surfacing code-level technical debt (use `$roll-.dream`)

## Behavior

### Step 1 — Gather Context

Read in parallel:

1. `.roll/backlog.md` — all existing US-XXX, FIX-XXX, REFACTOR-XXX, IDEA-XXX entries (both Todo and Done) to avoid proposing duplicates
2. `.roll/proposals.md` (if exists) — already-proposed items (avoid re-proposing rejected or pending ones)
3. Recent 20 commits via `git log --oneline -20` — what has recently shipped
4. `skills/` directory listing — what capabilities roll already has
5. Optional: any focus hint passed by the user

### Step 2 — Think from User Perspective

Frame proposals from the **product engineer / end user** point of view:

- What recurring friction do users of roll face that no current skill addresses?
- What workflow is partially covered but has visible gaps?
- What would make the autonomous loop more legible, controllable, or trustworthy to its human owner?

Avoid technical-debt reasoning (that is roll-.dream's domain). Focus on:
- New user-visible commands or behaviors
- Improvements to existing UX (output clarity, discoverability, onboarding)
- Integrations that extend reach (new AI tools, editor support, CI patterns)

### Step 3 — Draft 1–3 Proposals

Generate between 1 and 3 proposals. For each:

```
## PROPOSAL: {Short title}
```

`{Short title}` 写法：用户看得懂的一句话，说清楚"加什么"或"解决什么问题"。不用技术术语，不提内部实现。这句话批准后会直接成为 BACKLOG 里的描述。

```
**Motivation (why):**
One to two sentences from the user's perspective explaining the pain or opportunity.

**Target scenario:**
Concrete usage example — what the user does, what they see, what they gain.

**Acceptance Criteria (draft):**
- [ ] AC 1
- [ ] AC 2
- [ ] AC 3

**Suggested ID:** US-{EPIC}-{NNN}  (best-guess prefix; human assigns final ID)
**Suggested Epic / Feature:** {name}
**Estimated complexity:** {S | M | L}
```

Complexity guide: S = one skill file or small bin/roll change, M = skill + bin/roll + tests, L = multi-file + new infrastructure.

### Step 4 — Write to .roll/proposals.md

Resolve the canonical Workspace from injected context, then append to its `.roll/proposals.md` (create if absent). Never derive authority from cwd or a repository root; when unclear, invoke `$roll-.clarify` to choose an existing Workspace or create one.

```markdown
---
proposed: {YYYY-MM-DD HH:MM}
status: pending
---

{proposals from Step 3}
```

Use `---` as separator between proposal batches. Never overwrite existing content.

### Step 5 — Report

```
✅ roll-propose: {N} proposal(s) written to .roll/proposals.md

To approve: move the entry to .roll/backlog.md and assign a US-XXX ID.
To reject:  annotate with "Rejected: {reason}" to suppress future re-proposals.
```

## Output Rules

- Write proposals in the same language as the project's primary documentation (Chinese for this project).
- Never write directly to .roll/backlog.md — .roll/proposals.md is the staging area.
- If a similar proposal already exists in .roll/proposals.md (pending or rejected), note similarity and skip or merge rather than creating a duplicate.
- Aim for 2 proposals by default; generate 1 if context is thin, 3 if focus hint suggests a rich area.
- **3-stage discipline**: a proposal is a subjective deliverable, so the drafting
  session must NOT also approve it. The owner moving an entry into .roll/backlog.md
  IS the isolated Evaluator (the human is the fresh, unbiased session the 3-stage
  loop requires). The proposal's **Acceptance Criteria (draft)** are the explicit
  criteria that approval is graded against — keep them concrete and checkable so
  the decision is against stated criteria, not a vibe; never self-promote a draft.

## .roll/proposals.md Format

```markdown
# Roll Proposals

> 待审批提案。批准后手工移入 .roll/backlog.md 并分配 US-XXX 编号。
> 拒绝时在条目末尾注明拒绝原因，防止 Agent 重复提出相似提案。

---
proposed: 2026-05-11 11:30
status: pending
---

## PROPOSAL: ...

...

---
proposed: 2026-05-08 09:00
status: rejected
rejected_reason: 与现有 roll-design 功能重叠，不需要单独技能
---

## PROPOSAL: ...

...
```

## Workspace Execution Handoff

- `workspaceContextPolicies` is authoritative per operation. Consume the prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT`; both copies must be semantically identical.
- Missing context, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** and route to `roll-.clarify workspace_target`.
- Resolve proposal and backlog state only through `context.authorities`; `context.issue.execution.repositories` and any repository ID or alias are not authority for proposals.
- Do not rediscover authority from cwd or .roll. Retry and continuation must preserve the same Workspace and Issue/Story identity.
- Legacy migration or recovery input is never execution authority and must not be dual-written.
