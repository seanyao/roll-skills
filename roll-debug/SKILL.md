---
name: roll-debug
license: MIT
allowed-tools: "Read, Edit, Write, Bash, Agent"
description: "Load when a web page needs black-box browser diagnostics, console/network/state capture, root-cause analysis, and source fixes for project-owned issues."
workspace-execution-handoff: required
workspace-context-scope: repository_required
workspace-context-consumer: repository
workspace-context-operations: diagnose, source_fix
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# Roll Debug

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a web page needs black-box browser diagnostics, console/network/state capture, root-cause analysis, and source fixes for project-owned issues.

## When Not to Use

- Static architecture scans; load roll-.dream.
- General code review; load roll-.review or roll-review-pr.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Read [Black Box probe asset](assets/injectable-bb.js) when mounting the built-in diagnostic stub.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Open or attach to the target page.
2. Mount the Black Box probe and collect diagnostics.
3. Analyze console, network, DOM, storage, and source clues.
4. Fix only project-owned root causes.
5. Unmount the probe and report evidence.

## Hard Gates

- Cleanup is mandatory.
- Do not hide external-service or environment faults as source fixes.

## Gotchas

- Mount the black-box probe only long enough to diagnose; clean it up before final delivery.
- Only auto-fix root causes in project source; external services and browser environment issues need clear attribution.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.

## Workspace Execution Handoff

- `workspaceContextPolicies` is authoritative per operation. Consume the prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT`; both copies must be semantically identical.
- Missing context, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** and route to `roll-.clarify workspace_target`.
- Run diagnostics only in the selected `context.issue.execution.repositories` entry identified by repository ID or alias. `source_fix` additionally requires selected repository access `write`.
- Do not rediscover authority from cwd or .roll. Retry and continuation must preserve the same Workspace and Issue/Story identity.
- Legacy migration or recovery input is never execution authority and must not be dual-written.
