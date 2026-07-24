---
hidden: true
name: roll-.changelog
license: MIT
allowed-tools: "Read, Edit, Write, Bash(git:*)"
description: "Load when a completed Roll build or deploy needs CHANGELOG.md generated or updated from Done stories, acceptance evidence, and release notes."
workspace-execution-handoff: required
workspace-context-scope: policy_driven
workspace-context-consumer: policy_driven
workspace-context-operations: generate, refresh_feature_catalog
workspace-allows-ambient-cwd: false
workspace-allows-legacy-roll-path: false
---
# Roll Changelog

This hub keeps the routing boundary, hard gates, and execution skeleton in the initial context. Load the heavier runbook only when the task actually needs the detailed contract.

## Load

Load when a completed Roll build or deploy needs CHANGELOG.md generated or updated from Done stories, acceptance evidence, and release notes.

## When Not to Use

- Planning new backlog stories.
- Owner internal briefing; load roll-brief.

## Read On Demand

- Read [the full contract](references/full-contract.md) before executing the workflow end to end, recovering from failures, or checking exact output templates.
- Keep this hub in context for trigger boundaries and hard gates.

## Workflow Skeleton

1. Read Done stories and acceptance evidence.
2. Generate or update CHANGELOG.md.
3. Keep user-facing language external and concise.
4. Stage only the changelog artifact when required.

## Hard Gates

- No changelog entries from unaccepted work.
- No private backlog/process detail in public notes.

## Gotchas

- Only run after completion/deploy evidence exists; do not invent changelog bullets from Todo or In Progress backlog rows.
- Keep internal backlog detail out of user-facing CHANGELOG.md unless it is part of accepted release evidence.

## Maintenance

- Description changes require updates in `route-cases/skills.json`.
- New observed failures should add a gotcha and the matching positive or negative route case.
- Heavy examples, templates, recovery paths, and deterministic snippets belong in `references/`, `assets/`, or `scripts/`, not in this hub.

## Workspace Execution Handoff

- `workspaceContextPolicies` is authoritative per operation. Consume the prompt block and `ROLL_WORKSPACE_EXECUTION_CONTEXT`; both copies must be semantically identical.
- Missing context, invalid JSON, schema mismatch, Workspace mismatch, Story mismatch, or scope mismatch means **STOP** and route to `roll-.clarify workspace_target`.
- Resolve Workspace artifacts only through `context.authorities`; resolve repository commands only through `context.issue.execution.repositories` and an explicit repository ID or alias. Mutation additionally requires selected repository access `write`.
- Do not rediscover authority from cwd or .roll. Retry and continuation must preserve the same Workspace and Issue/Story identity.
- Legacy migration or recovery input is never execution authority and must not be dual-written.
