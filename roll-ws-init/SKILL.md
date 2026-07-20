---
name: roll-ws-init
description: Load when an operator wants to preview Workspace paths and repository bindings, initialize a complete Roll Workspace from a versioned config, or retry a failed `roll workspace init` without hand-writing its filesystem layout.
---

# Roll Workspace Init

Collect intent, write one `roll.workspace-init/v1` config, and delegate every
filesystem, registry, cache, and Git mutation to the CLI.

## Workflow

1. Collect the Workspace ID, root, display name, requirement references, and
   repository alias/source/integration branch. Collect provider, branch pattern,
   and required checks only when they differ from defaults.
2. Write the config outside the target Workspace root. Use the closed shape:

   ```yaml
   schema: roll.workspace-init/v1
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
   roll workspace init ws-demo --config /absolute/path/workspace-init.yaml --check --json
   ```

4. Inspect every `created|reused|repaired|rejected` decision. Resolve any
   rejected schema, identity, root, remote, or existing-content conflict by
   changing the config or preserving the conflicting operator-owned state.
5. When creation is requested, apply the exact reviewed config:

   ```bash
   roll workspace init ws-demo --config /absolute/path/workspace-init.yaml --json
   ```

6. Re-run the same command after an interrupted apply. Let the CLI read its
   repair journal and decide what is safe to repair or preserve.

## Hard Boundaries

- Never create Workspace directories or files with `mkdir`, `touch`, `cp`,
  shell redirects, or direct filesystem APIs.
- Never run `git clone`, `git init`, `git worktree`, or edit cache paths for
  Workspace initialization.
- Never edit `$ROLL_HOME/workspaces.json`, lifecycle events, cache identity
  files, locks, or repair journals directly.
- Never fall back to hand-written layout creation when the CLI rejects or fails.
- Never create a persistent product checkout inside the Workspace. Product code
  worktrees belong to later Issue initialization.
- Treat `--check` as the only preview contract; it must remain side-effect free.

## Recovery

On failure, report the CLI error and the machine repair-journal path it names.
Preserve pre-existing or dirty artifacts. Retry only with the same compatible
identity/config or with an explicitly corrected config; do not delete state to
force success.

## Gotchas

- A config file is an input contract, not permission to hand-create its target.
- A successful `--check` is still read-only; run apply only when initialization
  was requested.
- A reusable machine bare cache is not a Workspace product checkout.
