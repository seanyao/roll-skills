---
name: roll-ws-create
description: Load when an operator wants to preview and create a complete Roll Workspace from a versioned config through the canonical `roll workspace create` surface.
---

# Roll Workspace Create

Collect intent, write one `roll.workspace-create/v1` config, and delegate every
filesystem, registry, cache, and Git mutation to the CLI.

Creation establishes Workspace authorities and repository bindings; it does not activate the Workspace.
Use `roll workspace issue init` after creation for Story repository worktrees.
Use `roll workspace migrate` for a historical repository-local Roll project.

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

4. Inspect every `created|reused|repaired|rejected` decision. Resolve any
   rejected schema, identity, root, remote, or existing-content conflict by
   changing the config or preserving the conflicting operator-owned state.
5. Stop after preview unless the owner explicitly authorizes applying that
   exact Workspace ID and reviewed config. A clarification answer that selects
   "create new" authorizes preview only. After exact authorization, apply:

   ```bash
   roll workspace create ws-demo --config /absolute/path/workspace-create.yaml --json
   ```

6. Re-run the same command after an interrupted apply. Let the CLI read its
   repair journal and decide what is safe to repair or preserve.
7. Report the created Workspace ID and root. If the operator also requested
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

## Recovery

On failure, report the CLI error and the machine repair-journal path it names.
Preserve pre-existing or dirty artifacts. Retry only with the same compatible
identity/config or with an explicitly corrected config; do not delete state to
force success.

## Gotchas

- A config file is an input contract, not permission to hand-create its target.
- A successful `--check` is still read-only; run apply only after the owner
  authorizes the exact previewed create target.
- A reusable machine bare cache is not a Workspace product checkout.
- Multiple Workspaces may be active. Create establishes one explicit target and does
  not select a global current Workspace.
