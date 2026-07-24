---
name: roll-idea
license: MIT
allowed-tools: "Read, Edit"
description: "Load when the user gives a short idea or bug note that should be quickly classified, assigned an ID, and appended to backlog."
workspace-execution-handoff: required
workspace-context-scope: workspace_required_mutation
workspace-context-consumer: workspace
workspace-context-operations: capture
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# roll-idea

Every relative `.roll` path in this carrier resolves from `context.authorities` and is never joined to cwd.

## Gotchas

- Capture is intentionally shallow; do not expand into full DDD stories unless roll-design is invoked.
- Do not overwrite existing backlog numbering or statuses while appending the quick capture.

> One-liner in, backlog entry out. No questions asked.

## Trigger

User explicitly invokes `roll-idea` with a free-text description.

```
$roll-idea 评价页面的星星也要纳入到 draft 的 scope 里
$roll-idea 手机端星星指标一行一个从上往下排
$roll-idea 给 HOD 加一个批量导出 PDF 的功能
```

## When Not to Use

- Requirement needs discussion or splitting into Stories (use `$roll-design`)
- A US-XXX / FIX-XXX is ready to execute (use `$roll-build` / `$roll-fix`)
- Recording a development moment or feeling (use `$roll-notes`)

## Behavior

1. **Read** `.roll/backlog.md` from the project root.
2. **Classify** the input:
   - If it describes a defect, regression, broken behavior, or "也要/没/不/bug" → **bug**
   - Otherwise → **idea**
3. **Assign ID**:
   - Bug → next `FIX-NNN`
   - Idea → next `IDEA-NNN`
4. **Append** a new row to the appropriate table in `.roll/backlog.md`:
   - Bug → `## 🐛 Bug Fixes` table
   - Idea → `## 💡 Ideas` table (create the section if it doesn't exist)
5. **Update stats** line if present (e.g. `Bug Fixes: N`, `Ideas: N`).
6. **Report** the assigned ID and where it was recorded.

## Output format

```
📝 Recorded as {ID}

Type:   {bug|idea}
Table:  {Bug Fixes|Ideas}
Text:   {description}
```

## Rules

- Do **not** ask the user for clarification.
- If the description is vague, record it verbatim and append `(细节待确认)`.
- Never modify existing entries — only append new rows.
- If `.roll/backlog.md` does not exist, report an error and stop.

## Workspace Execution Handoff

- `workspaceContextPolicies` is authoritative per operation. Consume the prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT`; both copies must be semantically identical.
- Missing context, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** and route to `roll-.clarify workspace_target`.
- Resolve the backlog only through `context.authorities`; `context.issue.execution.repositories` and any repository ID or alias are not authority for capture.
- Do not rediscover authority from cwd or .roll. Retry and continuation must preserve the same Workspace and Issue/Story identity.
- Legacy migration or recovery input is never execution authority and must not be dual-written.
