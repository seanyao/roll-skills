---
name: roll-loop
license: MIT
allowed-tools: "Read, Glob, Grep, Write, Edit, Bash(git:*), Bash(cat:*), Skill"
description: "Load when configuring, explaining, or operating Roll autonomous backlog execution loop that scans Todo work and dispatches US/FIX/REFACTOR items."
workspace-execution-handoff: required
workspace-context-scope: workspace_required_mutation
workspace-context-consumer: workspace
workspace-context-operations: operate
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# Roll Loop

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when configuring, explaining, or operating Roll autonomous backlog execution loop that scans Todo work and dispatches US/FIX/REFACTOR items.

## Operating Modes

This skill is primarily **autonomous**: it describes the scheduler that dispatches
eligible backlog work. It also documents the explicit mode switches:
`roll loop on` / `roll loop resume` enter autonomous operation; `roll loop off` /
`roll loop pause` return control to **guided** operation. Autonomous mode never
bypasses pause, budget, route, evidence, Evaluator, or release gates.

## When Not to Use

- One-shot story execution by a human agent; load roll-build or roll-fix.
- Nightly architecture scan; load roll-.dream.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Scan BACKLOG for Todo items.
2. Route US/FIX/REFACTOR to the right skill.
3. Run bounded cycles with fresh context.
4. Persist events, runs, alerts, and status.
5. Pause on repeated failure.

## Delivery Lifecycle (US-DELIV-001..007)

最后一公里 = 一个 reconcile 闭环，无独立守护进程（`com.roll.pr.<slug>` PR Loop 已退役）。

- A cycle ends at publish: branch pushed + PR opened → `awaiting_merge`; the loop is released to pick the next card. Nothing blocks on merge.
- The **Delivery Reconciler** advances delivery opportunistically — cycle boundaries, read paths, and explicit `roll loop reconcile`: CI-green PRs are merged self-drive (`gh pr merge --squash`); merged PRs reconcile from `main` (L1 PR-state / L2 patch-id) to `delivered`; external / manual merges reconcile to `delivered_external` (first-class); insufficient evidence stays `awaiting_merge` — never misjudge.
- Reconcile is idempotent and crash-safe: any single `roll` invocation can advance the truth.

## Hard Gates

- Loop never cuts a release autonomously.
- Fail-loud and PAUSE beat silent fallback.

- NEVER run `git push` or `gh pr create` yourself inside a loop cycle: the RUNNER owns publish — it pushes the branch, opens the PR, and runs the attest/peer gates first. A self-published PR bypasses every gate (FIX-245: the runner adopts it and logs a discipline breach, but the gates have already been jumped). Finish your TCR commits and stop; publishing is not your step.
  循环内严禁自己 push/开 PR——发布由 runner 负责(先过闸再出门);自开 PR = 跳闸违纪。

## Gotchas

- Loop dispatches backlog items; it must not merge releases or bypass human-on-the-loop decisions.
- Fail-loud pause behavior is preferable to silent fallback when repeated execution breaks.

## Workspace Execution Handoff

- Before acting, parse the host-provided `Workspace Execution Context` prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT` as `roll.workspace-execution-context/v1`; they must be semantically identical. Missing either copy, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** before scanning or dispatching.
- This skill requires `workspace_required_mutation`. Read and write backlog, features, design, evidence, events, and runtime only through `context.authorities`; never derive authority from the shell cwd, a repository root, or a nearby `.roll` directory.
- Freeze each dispatched Issue identity and run commands only through that Issue's `context.issue.execution.repositories`. If more than one repository exists and the handoff names no repository ID or alias, STOP with `missing_execution_context`; never choose the first entry.
- On `requirement_match_required`, `ambiguous_requirement_match`, `requirement_workspace_conflict`, or `workspace_discovery_incomplete`, return the structured failure to `roll-.clarify workspace_target` and stop. Do not rediscover from cwd or `.roll`, activate a Workspace, or create one inside this skill.
- Retry and continuation keep the same Workspace and Issue/Story identity for the whole cycle; changing cwd or starting a new process never changes the frozen identity.
- Legacy migration may run only as an explicit `legacy_migration_only` operation outside the normal loop; legacy runtime or backlog layout is never loop authority and no public Workspace init path is offered.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.
