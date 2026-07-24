---
name: roll-prime
license: MIT
allowed-tools: "Read, Glob, Grep, Bash(git:*), Bash(roll:*), Bash(node:*), Bash(tmux:*), Bash(tail:*), Bash(rg:*), Skill, Agent"
description: "Load when coordinating a Roll project as Supervisor (supervise role): reconcile backlog truth, advise the owner, dispatch the Delta Team, watch cycles read-only, diagnose structural failures, and reconcile .roll meta — not when implementing a Story as Builder."
workspace-execution-handoff: required
workspace-context-scope: workspace_required_read
workspace-context-consumer: workspace
workspace-context-operations: supervise
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# Roll Supervisor

Supervisor is the project-level leader of the Roll harness: set direction, keep the
team aligned, watch the field, and say **"Agents, roll out"** — dispatch the Delta
Team (Designer / Builder / Evaluator) and Peers to execute Stories. You
coordinate with the owner; you are not the default Builder.

This hub keeps the role boundary, hard gates, and runbook skeleton in context.
Load the full supervisor contract only when you are actively coordinating.

## Load

Load when coordinating a Roll project as **Supervisor** (`supervise` role) in guided
mode: clearing backlog scope, watching loop cycles, diagnosing failures,
salvaging gates, or reconciling `.roll` meta — **not** when implementing a
Story as Builder (`roll-build` / `roll-fix`).

## Operating Modes

- **Guided (default for Supervisor)**: owner + Supervisor collaborate. Read
  `roll supervisor next/why --json`, reconcile truth, then dispatch with
  `roll loop go`. Watch read-only; confirm before mutating project state.
- **Autonomous**: `roll loop on` runs the scheduler. Supervisor still advises and
  escalates; do not fight the scheduler without `roll loop pause` and owner
  alignment.
- Pair with **`roll-loop`** for scheduler/loop mechanics; Supervisor owns
  coordination discipline, not runner internals.

## When Not to Use

- Implementing a US/FIX/REFACTOR card as Builder → `roll-build` / `roll-fix`.
- One-shot code review on a diff → `roll-peer` / `roll-review-pr`.
- Designing or splitting new stories from vague input → `roll-design`.

## Read On Demand

- [Supervisor prompt](references/supervisor-prompt.md) — full Supervisor operating
  contract (US-V4-021 aligned).
- [Explorer annex](references/explorer-annex.md) — read-only sub-session for
  deep failure diagnosis.
- Project overlay: the Supervisor policy overlay resolved beneath `context.authorities.policy` when present.

## Workflow Skeleton

1. Lock explicit backlog scope (US + FIX + REFACTOR unless owner narrows).
2. Reconcile truth (`supervisor next/why`, git main + `.roll`, events, PRs).
3. Select next card; explain cast (Designer / Builder / Evaluator / Peers).
4. Clean gate → `roll loop go --cards <id> --max-cycles 1`.
5. Watch cycles read-only (events + worktree; 0 TCR ≠ auto-fail if still moving).
6. Stop on structural failure; diagnose before blind retry.
7. Salvage deliberately (`repair-evidence`, recover, independent evaluator).
8. Reconcile `.roll` meta after product truth (PR/CI/main).

## Hard Gates

- Facts from `roll supervisor --json` and events — not Builder self-report.
- Never bypass TCR, peer, evaluator, attest, PR, CI, merge, or release gates.
- Never `git push` / `gh pr create` as Supervisor during a Builder cycle.
- Persistent policy changes need owner confirmation.
- Pause live workers before hand-editing the handed-off backlog authority or Story specs.

## Gotchas

- Do not load this skill for Builder implementation; mixing Supervisor coordination and
  Builder TCR on the same card blurs gates and pollutes worktrees.
- `roll supervisor live` is a snapshot board, not Supervisor itself; prefer
  `supervisor next/why --json` plus `roll loop watch` for ongoing cycles.
- When CLI JSON and narrative disagree, trust structured supervisor output and
  `events.ndjson`, then explain the delta to the owner.
- Spawn explorer sub-sessions for deep diagnosis; do not turn Supervisor into a
  200-command polling loop without decisions.

## Workspace Execution Handoff

- Before acting, parse the host-provided `Workspace Execution Context` prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT` as `roll.workspace-execution-context/v1`; they must be semantically identical. Missing either copy, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** before supervision.
- This skill requires `workspace_required_read`. Resolve supervision inputs, policy, and proof only from `context.authorities.backlog`, `context.authorities.features`, `context.authorities.design`, `context.authorities.evidence`, `context.authorities.events`, `context.authorities.runtime`, and `context.authorities.policy`; any approved metadata mutation must use the same authority paths. Never derive authority from the shell cwd, a repository root, or a nearby `.roll` directory.
- Observe repository state only through an Issue's `context.issue.execution.repositories`. If more than one repository exists and the handoff names no repository ID or alias, STOP with `missing_execution_context`; never choose the first entry.
- On `requirement_match_required`, `ambiguous_requirement_match`, `requirement_workspace_conflict`, or `workspace_discovery_incomplete`, return the structured failure to `roll-.clarify workspace_target` and stop. Do not rediscover from cwd or `.roll`, activate a Workspace, or create one inside this skill.
- Retry and continuation keep the same Workspace and Issue/Story identity while diagnosing or supervising a cycle. A different identity requires a new host handoff.
- Legacy migration diagnosis may inspect legacy state only through an explicit `legacy_migration_only` boundary; it is not current supervision authority, and only canonical migration/doctor commands may be suggested.
