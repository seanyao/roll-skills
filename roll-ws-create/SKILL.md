---
name: roll-ws-create
description: Load when an operator wants to preview and create a complete Roll Workspace from a versioned config through the canonical `roll workspace create` surface.
workspace-execution-handoff: machine_create_required
workspace-context-scope: machine_only
workspace-context-consumer:
workspace-context-operations: preview,apply
workspace-allows-ambient-cwd: true
workspace-allows-legacy-roll-path: false
---

# Roll Workspace Create

Collect intent, write one `roll.workspace-create/v1` config, and delegate every
filesystem, registry, cache, and Git mutation to the CLI.

Creation establishes Workspace authorities and repository bindings; it does not activate the Workspace.
Use `roll workspace issue init` after creation for Story repository worktrees.
Use `roll workspace migrate` for a historical repository-local Roll project.

## Workspace Execution Handoff

- This is the `machine_only` exception: normal creation starts with no Workspace execution context because the target does not exist. It consumes an explicit create handoff, never an inferred current Workspace.
- If a host supplies either a `Workspace Execution Context` prompt block or `ROLL_WORKSPACE_EXECUTION_CONTEXT`, it must supply both; the pair must be semantically identical `roll.workspace-execution-context/v1` JSON. A partial pair, invalid JSON, or identity/schema conflict means **STOP**, but absence of both is valid for this machine-only flow.
- Preview runs only through `--check` and records the returned `workspaceId`, `configSha256`, and `planSha256`. Apply consumes `roll.workspace-create-apply-authorization/v1` only when those values are unchanged; natural-language `create_new` permits preview only, and broad statements of create intent are not sufficient to authorize apply.
- When the create config declares multiple repositories, validate all config bindings in the preview. Creation does not select one Issue repository and does not reuse an Issue execution contract.
- On `requirement_match_required`, `ambiguous_requirement_match`, `requirement_workspace_conflict`, or `workspace_discovery_incomplete`, return the structured failure to `roll-.clarify workspace_target` and stop. Do not rediscover from cwd or `.roll`, activate a Workspace, or apply creation from the clarification answer.
- Retry and continuation keep the same create identity and preview digests through authorization. Any config, identity, or plan change requires a fresh preview and authorization.
- Read and reconcile the named old `workspace-init` journal schema.
- Use only the CLI recovery path; never execute that historical command or treat repository-local layout as authority.

## Workflow

1. Collect the Workspace ID, root, display name, requirement references, and
   repository alias/source/integration branch. Collect provider, branch pattern,
   and required checks only when they differ from defaults.
2. Write the config outside the target Workspace root. Use the closed shape:

   ```yaml
   schema: roll.workspace-create/v1
   id: ws-demo
   root: ~/.roll/workspaces/ws-demo
   display_name: Demo Workspace
   requirements:
     - provider: jira
       ref: SOT-15499
   repositories:
     - alias: product
       source: git@example.test:team/product.git
       integration_branch: main
       provider: generic
       required_checks: [unit, integration]
   ```

3. Preview before applying:

   ```bash
   roll workspace create ws-demo --config /absolute/path/workspace-create.yaml --check --json
   ```

4. Inspect every `created|reused|repaired|rejected` decision and record the
   returned `workspaceId`, `configSha256`, and `planSha256`. Resolve any rejected
   schema, identity, root, remote, journal-recovery, or existing-content conflict
   by changing the config or preserving the conflicting operator-owned state.
5. Stop after preview. A `$roll-.clarify` answer with action `create_new` is
   preview only: it never authorizes apply. Ask the owner to approve the exact
   `workspaceId` + `configSha256` + `planSha256` tuple shown by the current
   preview; broad statements such as "create a Workspace" are not sufficient.
6. Only after that exact approval, write an authorization file outside the
   target Workspace root using the closed JSON contract and the unchanged
   preview values:

   ```json
   {
     "schema": "roll.workspace-create-apply-authorization/v1",
     "workspaceId": "ws-demo",
     "configSha256": "<64-hex digest from preview>",
     "planSha256": "<64-hex digest from preview>",
     "source": "owner_after_preview"
   }
   ```

7. Apply with that file; never use a bare agent apply command:

   ```bash
   roll workspace create ws-demo --config /absolute/path/workspace-create.yaml --authorization /absolute/path/workspace-create-authorization.json --json
   ```

8. After an interrupted apply, run `--check --json` again.
   Read and reconcile the named old `workspace-init` journal schema.
   Let the CLI reconcile the current `workspace-create` journal. If either digest
   changed, discard the old authorization and obtain owner approval for the new
   exact preview before retrying; never edit or delete a journal directly.
9. Report the created Workspace ID and root. If the operator also requested
   lifecycle activation, hand that separate action back to `roll workspace
   activate <id|path>` after creation has completed; do not fold it into
   this skill's shell blocks.

## Hard Boundaries

- Never create Workspace directories or files with `mkdir`, `touch`, `cp`,
  shell redirects, or direct filesystem APIs.
- Never run `git clone`, `git init`, `git worktree`, or edit cache paths for
  Workspace creation.
- Never edit `$ROLL_HOME/workspaces.json`, lifecycle events, cache identity
  files, locks, or repair journals directly.
- Never fall back to hand-written layout creation when the CLI rejects or fails.
- Never create a persistent product checkout inside the Workspace. Product code
  worktrees belong to later Issue initialization.
- Never create or repair Story worktrees; that belongs to `roll workspace issue
  init` after the Workspace exists.
- Never migrate a repository-local `.roll`; historical conversion belongs to
  `roll workspace migrate --check` plus its reviewed apply transaction.
- Never activate, pause, or archive a Workspace as an implicit consequence of
  creation.
- Treat `--check` as the only preview contract; it must remain side-effect free.
- Never apply from an agent or skill without `--authorization <file>` whose
  `source` is `owner_after_preview` and whose three preview identity/digest
  fields match the current CLI plan exactly.
- Never convert a `create_new` clarification answer into an authorization file;
  it permits only config collection and preview.

## Recovery

On failure, report the CLI error and the machine repair-journal path it names.
Preserve pre-existing or dirty artifacts. Retry only with the same compatible
identity/config or with an explicitly corrected config; do not delete state to
force success.

## Gotchas

- A config file is an input contract, not permission to hand-create its target.
- A successful `--check` is still read-only; run apply only after the owner
  authorizes the exact previewed Workspace ID, config digest, and plan digest.
- Any config, filesystem, cache, registry, or journal change can change the plan
  digest. A stale authorization must lead back to preview, never to a broader
  interpretation of earlier owner intent.
- A reusable machine bare cache is not a Workspace product checkout.
- Multiple Workspaces may be active. Create establishes one explicit target and does
  not select a global current Workspace.
