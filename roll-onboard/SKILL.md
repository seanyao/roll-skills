---
name: roll-onboard
license: MIT
description: "Load when bringing an existing codebase without Roll markers into Roll through read-only diagnosis and structured .roll/init-diagnosis.yaml + .roll/onboard-plan.yaml artifacts."
---
# Roll Onboard

## Gotchas

- This skill is for an **existing codebase without Roll**, not an empty project, PRD-only project, already-onboarded Roll project, or pre-v2 Roll layout.
- The agent is the cognition layer. It may diagnose, ask questions, and write structured artifacts only.
- Respect privacy/scope answers from the interactive questions as hard constraints.

> Follows the Architecture Constraints, Development Discipline, and Engineering Common Sense defined in the project AGENTS.md.

## Trigger

Use this skill when:

- `roll init` detected an existing codebase without Roll and printed `Next: $roll-onboard`.
- The CLI told the user that `$roll-onboard` requires an AI agent.
- The user invokes `$roll-onboard` from the existing codebase root.

Do not use this skill for PRD-only workspaces. Those are new projects and should go through `$roll-design` / fresh init.

## Hard Responsibility Boundary

You may write exactly these two files:

1. `.roll/init-diagnosis.yaml`
2. `.roll/onboard-plan.yaml`

You must not create, edit, delete, move, or shell-mutate any other project file.

| You do | You do NOT |
|--------|------------|
| Read project code, manifests, docs, and tests | Modify source files |
| Run read-only probes and `roll-doc-audit --dry-run` | Write `AGENTS.md` |
| Ask the user nine focused onboarding questions | Write `.gitignore` |
| Write `.roll/init-diagnosis.yaml` | Write `.roll/backlog.md` |
| Write `.roll/onboard-plan.yaml` | Write docs or feature specs |
| Stop and tell the user to review and apply the plan | Run `roll init --apply` |

Hard constraint: the plan may describe CLI-owned merge intents, but any source, `AGENTS.md`, `.gitignore`, backlog, docs, features, or offboard mutation is the responsibility of `roll init --apply`, not the agent.

## Inputs You Must Read

1. Run `roll init` first and record the non-mutating diagnosis, especially `facts hash: sha256:...`.
2. The repository tree, manifests, source roots, test roots, and existing docs.
3. Any existing `README.md` / `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` etc. as evidence.
4. `roll-doc-audit --dry-run` output to identify documentation gaps without writing.
5. The pre-v2 Roll marker scan: `BACKLOG.md`, `PROPOSALS.md`, `docs/features/`, `docs/briefs/`, `docs/dream/`.

If pre-v2 Roll markers are present, stop and tell the user to run:

```sh
npx @seanyao/roll@2 migrate --dry-run
```

## Workflow

### Step 0 - Pre-flight

1. Confirm the current directory is an existing codebase root with source/manifests and no current Roll markers (`.roll/`, `.roll/backlog.md`, `.roll/features/`, `AGENTS.md`).
2. Confirm no pre-v2 Roll markers are present. If they are present, stop and route to the v2 migration command above.
3. Check whether `.roll/init-diagnosis.yaml` or `.roll/onboard-plan.yaml` already exists. If either exists, ask the user before overwriting it.

### Step 1 - Read Code And Build Understanding

Walk the repo. Identify:

- `type`: one of `backend-service` / `frontend-only` / `fullstack` / `cli`
- `description`: 1-2 sentence summary of what this project does
- `domains`: top business/technical domains
- `key_modules`: top 3-5 modules that hold most of the logic

### Step 1b - Business Model, Tech, Tests

A normal onboard produces three structured plan sections: `domain_model`, `tech_analysis`, and `test_assessment`.

`domain_model`:

- Identify bounded contexts from code and docs.
- For each context, emit `name`, `aggregates`, and `ubiquitous_language`.
- If contexts cannot be inferred, emit `bounded_contexts: []`. Do not invent contexts.

`tech_analysis`:

- `stack`: languages/frameworks evidenced by manifests.
- `dependencies`: dependencies from manifests.
- `architecture_notes`: observed structure, not aspirational design.
- `risks`: mappings with `description`; optional `severity: LOW|MEDIUM|HIGH`; optional `evidence: detected|inferred`.

`test_assessment` must be backed by a real filesystem scan:

1. Count test files by conventional patterns:
   - `*.test.*` / `*.spec.*`
   - `*_test.go`
   - `test_*.py` / `*_test.py`
   - `*_spec.rb`
   - `*Test.java`
2. Probe for runner configs:
   - `jest.config.*`, `vitest.config.*`, `.mocharc.*`, `pytest.ini`, `[tool.pytest]` in `pyproject.toml`, `karma.conf.*`, `phpunit.xml`
   - `go test` is implied by `*_test.go`
3. Probe for coverage artifacts:
   - `coverage/`, `.coverage`, `coverage.xml`

Every `test_assessment` claim must be a mapping with an evidence tag:

```yaml
claim: "42 *.test.ts files detected"
evidence: detected
```

Use `evidence: detected` for direct scan results, including `claim: "none detected"` when a scan returns zero. Use `evidence: inferred` only for judgement derived from detected facts.

### Step 2 - Get Gap Report

Run:

```sh
roll-doc-audit --dry-run
```

Use it as read-only input. Do not run write mode.

### Step 3 - Ask Nine Questions

Aim for total time <= 3 minutes.

Group 1 - confirm understanding:

1. Is this type/description right?
2. Are these domains right?
3. Are these key modules right?

Group 2 - scope:

4. Which Roll surfaces should `roll init --apply` create? Multi-select:
   - `backlog` - initial backlog
   - `features` - features index and per-feature spec stubs
   - `domain` - DDD context map
   - `briefs` - directory for brief outputs
5. Which existing docs should Roll include rather than regenerate?
6. Put drafts inside `.roll/`? Default yes.

Group 3 - privacy and next steps:

7. Add `.roll/` to `.gitignore`?
8. Sync Roll conventions to which detected AI tools?
9. Enable `roll loop` autonomous execution after init?

### Step 4 - Write `.roll/init-diagnosis.yaml`

Create `.roll/` if needed, then write this schema:

```yaml
version: 1
createdAt: "2026-06-27T00:00:00+08:00"
factsHash: "sha256:<64 lowercase hex chars from roll init>"
diagnosis:
  kind: codebase-no-roll
  recommendedPath: agentic-onboard
  confidence: high
  reasons:
    - Existing source, tests, or manifests found without Roll markers.
agent:
  name: codex
  status: available
```

### Step 5 - Write `.roll/onboard-plan.yaml`

Write this schema. `factsHash` must exactly match `.roll/init-diagnosis.yaml`.

```yaml
version: 1
generated_at: "2026-06-27T00:00:00+08:00"
factsHash: "sha256:<same value as init-diagnosis.yaml>"

file_operations:
  - path: .roll/init-diagnosis.yaml
    operation: write
    idempotent: true
  - path: .roll/onboard-plan.yaml
    operation: write
    idempotent: true

merge_intents:
  - target: roll_conventions
    owner: roll-init-apply
    strategy: merge global Roll conventions into AGENTS.md
  - target: backlog
    owner: roll-init-apply
    strategy: create only when approved by scope
  - target: features
    owner: roll-init-apply
    strategy: create only when approved by scope
  - target: domain
    owner: roll-init-apply
    strategy: create only when approved by scope
  - target: briefs
    owner: roll-init-apply
    strategy: create only when approved by scope
  - target: agent_routes
    owner: roll-init-apply
    strategy: seed selected routing template
  - target: gitignore
    owner: roll-init-apply
    strategy: append .roll/ only when privacy requests it
  - target: sync_targets
    owner: roll-init-apply
    strategy: sync conventions after apply succeeds

project_understanding:
  type: cli
  description: "..."
  domains: []
  key_modules: []

scope:
  approved: [backlog, features, domain]
  declined: [briefs]

include_existing:
  - README.md

privacy:
  gitignore_dot_roll: true

sync_targets: [claude, pi]
enable_loop: false
agent_routes_template: default

domain_model:
  bounded_contexts: []

tech_analysis:
  stack: []
  dependencies: []
  architecture_notes: []
  risks: []

test_assessment:
  current_layers:
    - claim: "none detected"
      evidence: detected
  gaps:
    - claim: "none detected"
      evidence: detected
  recommended_actions: []
```

Forbidden plan content:

- No `cmd`, `command`, `commands`, `exec`, `run`, `script`, `shell`, or `shell_commands` keys.
- No `file_operations` path except `.roll/init-diagnosis.yaml` and `.roll/onboard-plan.yaml`.
- No direct path mutation intent for source files, `AGENTS.md`, `.gitignore`, `.roll/backlog.md`, docs, features, or offboard files.
- No `merge_intents[].path`; use `target` + `owner: roll-init-apply`.

### Step 6 - Stop

Tell the user:

> Onboard conversation done. Diagnosis saved to `.roll/init-diagnosis.yaml`.
> Plan saved to `.roll/onboard-plan.yaml`.
> Review `.roll/init-diagnosis.yaml` and `.roll/onboard-plan.yaml` before applying.
> Return to your terminal and run:
>
>     roll init --apply
>
> In non-interactive automation after review, use:
>
>     roll init --apply --auto
>
> After apply, continue with:
>
>     roll next
>
> The plan expires in 24 hours.

Do not run `roll init --apply` yourself.

## Failure Modes

- User aborts mid-conversation: do not write partial artifacts; tell the user to rerun from scratch.
- Answers contradict detected facts: ask the contradictory question once more; if they confirm, respect the choice.
- You cannot infer enough project understanding: write the artifact with detected facts only and tell the user which fields must be edited before apply.
