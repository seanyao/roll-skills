---
hidden: true
name: roll-.dream
license: MIT
allowed-tools: "Read, Glob, Grep, Bash(git:*, curl:*, claude:*), Write, Edit"
description: "Load when a scheduled or manual nightly architecture health scan should inspect code structure, dead code, doc staleness, and refactor candidates."
workspace-execution-handoff: required
workspace-context-scope: policy_driven
workspace-context-consumer: policy_driven
workspace-context-operations: record_candidates, scan
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# Roll Dream

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a scheduled or manual nightly architecture health scan should inspect code structure, dead code, doc staleness, and refactor candidates.

## When Not to Use

- Runtime patrols; load roll-sentinel.
- Local web debugging; load roll-debug.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Scan structure, dead code, drift, and docs.
2. Classify findings as refactor/doc candidates.
3. Write daily dream log and backlog candidates.
4. Keep recommendations human-reviewed.

## Hard Gates

- Do not auto-activate scored findings.
- Fail loud if the dream skill or project context is missing.

## Gotchas

- Dream reviews code and architecture health, not live production behavior; use roll-sentinel for runtime patrols.
- Findings become human-reviewed backlog candidates; do not auto-activate refactors from scoring signals.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.

## Workspace Execution Handoff

- `workspaceContextPolicies` is authoritative per operation. Consume the prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT`; both copies must be semantically identical.
- Missing context, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** and route to `roll-.clarify workspace_target`.
- `scan` reads only the selected repository from `context.issue.execution.repositories` by repository ID or alias. `record_candidates` writes only through `context.authorities`; repository mutation is forbidden for that operation.
- Do not rediscover authority from cwd or .roll. Retry and continuation must preserve the same Workspace and Issue/Story identity.
- Legacy migration or recovery input is never execution authority and must not be dual-written.
