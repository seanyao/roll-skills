---
name: roll-delta-team
license: MIT
allowed-tools: "Read, Glob, Grep, Bash(roll:*), Bash(git:*), Skill"
description: "Load when the current coding-agent main session must run a host-guided Delta Team delivery: it acts as implicit Supervisor and drives a Designer → Builder → Evaluator artifact-only handoff through the roll delta CLI, requesting and attesting D/B/E sub-agents with its own host facilities — Roll never spawns a session."
---
# Roll Delta Team

A **Delta Team** delivery is a host-guided, artifact-only Designer → Builder →
Evaluator (D → B → E) protocol. Your current main coding-agent session **is the
implicit Supervisor**. You use *your host's own* sub-agent facility to create the
D/B/E sessions; Roll only manages the protocol — evidence frames, schema
validation, events, projections, and fail-closed gates — through the `roll delta`
CLI. Roll never spawns, resumes, or configures any session, including yours.

This skill is the host-neutral procedure. Pi, Cursor, and any other host
implement the same protocol with their native sub-agent features.

## Load

Load when the owner asks your running main session to deliver one story as a
Delta Team (host-guided D → B → E), and you will request/attest the role
sub-agents yourself and drive `roll delta prepare / validate / conclude`.

## When Not to Use

- Implementing a story yourself as a single Builder → `roll-build` / `roll-fix`.
- Autonomous loop scheduling and cycle mechanics → `roll-loop`. A
  `loop-autonomous` request for `delta-team` has no host main session and is
  deterministically blocked `host_supervisor_required`; it is never converted.
- Full Delta Team (independently orchestrated multi-agent/multi-host topology).
  That uses Roll's generic adapters, not this host-guided procedure.
- Project coordination / backlog reconciliation → `roll-prime`.

## Boundary invariants — read before every run

These are the honest limits of the protocol. State them; never overclaim.

1. **You are the implicit Supervisor.** Roll never spawns your session and never
   spawns the role sub-agents. Do not delegate the Supervisor role to anyone.
2. **Host self-attestation is STRUCTURAL validation only.** When you attest a
   role sub-agent, `roll delta validate` checks that the tokens
   (`hostId`, `roleInstanceId`, `sessionId`, `modelId`) are non-empty, unique
   where uniqueness is required, and correspond across resolution/event/manifest.
   That is **all** it proves. It does **not** prove that a fresh session was
   created, that the stated role/model was honored, or that any model actually
   executed. Never say or imply otherwise in any report or artifact.
3. **Artifact-only handoff.** Roles hand off through named, checksummed files and
   the event stream — never raw chat, prompts, chain-of-thought, tool traces, or
   `live.log`. Do not relay a role's conversation to the next role.
4. **Builder is the sole worktree writer.** Designer, Evaluator, and Peer are
   read-only except for their own artifact output directory.
5. **Peer is optional advisory input to the Evaluator, never a substitute** for
   it and never its verdict.
6. **Host-guided cost is unobservable.** Status renders
   `? (host_unobservable)`. Never estimate, price, or emit zero.
7. **No delivery/Done claim from the protocol.** `delta:terminal(handoff_ready)`
   is not a merge, an attest verdict, a DeliveryRecord, or Done. See Terminal
   binding below.

## Step 0 — Install the local preset (one-time, host-local)

The preset is machine-local host input, never project config. `roll setup`
installs only an example; you create the working file.

```sh
mkdir -p ~/.roll/delta-team
cp skills/roll-delta-team/presets.yaml.example ~/.roll/delta-team/presets.yaml
# then edit ~/.roll/delta-team/presets.yaml for your host and models
```

The example ships `pi-balanced-v1`. Keep concrete model IDs only in this
machine-local file — never copy them into the repository, `.roll/agents.yaml`,
`.roll/policy.yaml`, or `@roll/core`.

## Model resolution (design §4.3)

You (the host skill), not Roll core, obtain the live inventory and run this
deterministic algorithm. Roll validates the resulting resolution; it never probes
a host.

1. Load the requested machine-local preset and compute its SHA-256.
2. Read the host's currently available model pool. Reject an inventory whose
   `hostId` differs from the preset host or whose timestamp is missing.
3. Normalize owner instructions into constraints: exact pin(s), exclusions, max
   cost class, diversity level. Store only the normalized constraints/digest in
   evidence — **never raw chat**.
4. For each role, remove unavailable, excluded, tag-ineligible, and
   over-hard-cost-cap models. A user pin is **hard**: if unavailable, **stop**.
5. Score remaining candidates in this order: hard user pin → preset preference
   order → risk/tag fitness → diversity relative to already-chosen role models →
   requested cost preference → stable lexical model-id tie-break.
6. `diversity: require` accepts **no** same-model substitute. `diversity: prefer`
   may reuse the best available same model only with
   `source: availability-fallback` plus an explicit reason.
7. Emit a complete `DelegationResolution` JSON: each role's resolved model claim,
   a delegation-unique `roleInstanceId`, `source`, and `reasons`. Pass it to
   `roll delta prepare --resolution <path>`.

No fallback is silent; no failed query becomes a guessed default; a missing
compatible candidate fails the delegation **before Designer starts**.

## The procedure (design §7.2)

1. **Identify Supervisor.** Your main session is the implicit Supervisor. Do not
   delegate it.
2. **Discover the host model pool** through your host-native means (the live
   inventory). If it is unavailable or stale, **stop** before `prepare`.
3. **Resolve models** with the §4.3 algorithm using the local preset, write the
   resolution JSON to a temp path, and prepare the delegation:

   ```sh
   roll delta prepare <STORY-ID> \
     --trigger host-guided --topology delta-team --profile <standard|verified|designed> \
     --preset <preset-id> --resolution /tmp/<story>-resolution.json --json
   ```

   `prepare` claims the `host-delegation` story lease, atomically allocates the
   `delta-<delegationId>/` evidence frame (no cycle, no `runs.jsonl`, no
   `cycle:terminal`, no `latest` update), writes the recovery marker + resolution
   + preparation files, appends one `delta:prepared` and one `delta:role_resolved`
   per role, and prints the delegation/run IDs and artifact paths. It starts no
   agent. Record the `delegationId`.

4. **Request the Designer** via your host sub-agent facility using the resolved
   Designer model. Give it **only** the declared contract inputs (story spec,
   relevant code refs, evaluation contract) and the output path
   `role-artifacts/designer/design-contract.md`. It is **read-only** except its
   own artifact directory. Write a matching **host attestation** (opaque
   `roleInstanceId`, `sessionId`, role, model tokens). The Designer authors the
   contract and its v2 manifest.
5. **Validate the Designer stage; stop on failure:**

   ```sh
   roll delta validate --delegation <DELEGATION-ID> --stage designer --json
   ```

   Non-zero exit means blocked — see Failure modes, then stop.
6. **Request the Builder.** Its only collaboration input is the *validated design
   contract* + spec + named references — never the Designer's chat. It is the
   **sole worktree writer**: it changes code, runs tests, commits, and authors
   `role-artifacts/builder/execute-evidence.md` (which lists commit/diff refs,
   commands/tests, evidence refs, limitations — and contains **no** merge
   recommendation). Attest it, then validate:

   ```sh
   roll delta validate --delegation <DELEGATION-ID> --stage builder --json
   ```

7. **Request the Evaluator.** Give it **only** artifact refs: Designer contract,
   Builder evidence, diff, tests/CI/attest refs, and the output path
   `role-artifacts/evaluator/eval-report.md`. It is **read-only** except its
   artifact directory; **do not let your main session write its report.** Its
   opaque `sessionId` must differ from the Builder's. It authors `eval-report.md`
   with explicit `## Inputs checked` and `## Rationale` sections. Attest, then
   validate:

   ```sh
   roll delta validate --delegation <DELEGATION-ID> --stage evaluator --json
   ```

8. **(Optional) Peer.** If the profile calls for it, request a fresh host-attested
   Peer with the same reviewable artifacts, publish/validate its
   `role-artifacts/peer/peer-report.md`, and give it to the Evaluator **as an
   input only**. The Peer never substitutes for the Evaluator or authors a
   verdict.

   ```sh
   roll delta validate --delegation <DELEGATION-ID> --stage peer --json
   ```

9. **Present and conclude.** Show the owner the Evaluator recommendation and the
   evidence refs. Then:
   - If the recommendation is `merge` **and** the owner approves the Option C
     binding, conclude:

     ```sh
     roll delta conclude --delegation <DELEGATION-ID> \
       --delivery-disposition owner_continue --json
     ```

     This records `delta:terminal(handoff_ready, terminalBinding: handoff_only,
     deliveryDisposition: owner_continue)`. It creates **no** cycle, PR, attest,
     or DeliveryRecord.
   - If the recommendation is `repair` / `resize` / `hold` / `escalate`, or the
     owner chooses to hold/redelegate, conclude as blocked and **stop** — do not
     auto-spawn a repair loop:

     ```sh
     roll delta conclude --delegation <DELEGATION-ID> \
       --delivery-disposition owner_hold --json      # or owner_redelegate
     ```

   Absent an owner-approved disposition, `conclude` blocks
   `terminal_path_unselected` and records nothing terminal.

## Terminal binding — Option C (handoff only)

Ratified by the owner (design §0.1 / §8.1). A structurally valid Evaluator report
can only reach `delta:terminal(handoff_ready)`. It is **not** Done.

After `handoff_ready` with `owner_continue`, the **owner manually invokes the
existing delivery/PR/attest procedure** — Roll auto-binds nothing beyond artifact
references and makes no delivery/Done claim. The sole Done terminal remains the
existing Story path: accepted evidence via `roll attest`; delivery reconciled from
a PR merged into `main`; Story truth follows GitHub merge evidence. An Evaluator
recommendation never changes those facts.

## Worked Pi walkthrough (design §8.2)

**Situation:** the owner asks the running Pi session to deliver `US-DELTA-021`, a
high-risk protocol change, requesting diversity and a medium-cost Builder. The
live pool is the seven Pi models in the preset example. The main Pi session is
the implicit Supervisor.

1. Pi reads `pi-balanced-v1` from `~/.roll/delta-team/presets.yaml` and observes
   its live pool, normalizing owner intent to
   `{ builderMaxCost: "medium", evaluatorDiversity: "require" }`.
2. It resolves (per §4.3):
   - Designer → `a-proxy/claude-opus-4-8` — first reasoning-preferred available.
   - Builder → `a-proxy/claude-sonnet-5` — preferred coding model within medium cost.
   - Evaluator → `o-proxy/gpt-5.6-terra` — preferred review model, distinct from D/B.
   - Optional Peer → `deepseek/deepseek-v4-flash` — low-cost optional review input.
3. It writes the resolution JSON and runs:

   ```sh
   roll delta prepare US-DELTA-021 \
     --trigger host-guided --topology delta-team --profile designed \
     --preset pi-balanced-v1 --resolution /tmp/us-delta-021-resolution.json --json
   ```

   `prepare` takes the host-delegation lease, allocates `delta-<delegationId>/`
   (not a cycle run), writes the recovery marker and `role-artifacts/delegation/`
   files, appends one `delta:prepared` and four `delta:role_resolved` events, and
   returns the IDs/paths. No agent started; no cycle created.
4. Using Pi's native sub-agent feature, Pi requests a **Designer** on the resolved
   Designer model and writes a matching host attestation (opaque `roleInstanceId`,
   `sessionId`, role, model). The prompt carries the story spec and the path
   `role-artifacts/designer/design-contract.md`, and states read-only /
   artifact-only. The Designer writes the contract and v2 manifest. Pi runs
   `roll delta validate --delegation <id> --stage designer`. Roll validates
   non-empty/unique tokens and correspondence — **not** that Pi truly created a
   fresh session or ran that model.
5. Pi requests a **Builder** with the same form of attestation. Its only input is
   the validated design contract/spec plus references — not the Designer chat. It
   holds the sole builder worktree lease, changes code, runs tests, commits, and
   writes `role-artifacts/builder/execute-evidence.md`. Pi validates the Builder
   stage.
6. The optional **Peer** gets the same attestation treatment, reads the contract,
   builder evidence, diff, and tests, writes `peer-report.md`, and is validated.
   Its report is an Evaluator input, not a verdict.
7. Pi requests an **Evaluator** with a matching attestation. It receives artifact
   refs only (Designer contract, Builder evidence, peer report, diff, tests/CI,
   attest refs) and writes `role-artifacts/evaluator/eval-report.md` with no
   product writes. `roll delta validate` confirms structural validity,
   event/model/role-token correspondence, and a different opaque session/role
   token from the Builder. It cannot prove freshness, execution identity, or model
   execution.
8. If the report recommends `merge`, Pi appends
   `delta:terminal(handoff_ready, terminalBinding: handoff_only,
   deliveryDisposition: owner_continue)` via `roll delta conclude` and shows the
   owner the Option C path; the owner then manually invokes the existing
   delivery/PR/attest procedure — only its PR → `main` reconciliation makes the
   story Done. If it recommends `repair` / `resize` / `hold` / `escalate`, Pi
   concludes as blocked and asks the owner for the next action. No role is
   silently re-run and no model selection is written back to `pi-balanced-v1` or
   project config.

This proves only the honest boundaries: Pi requests and attests its own sub-agent
sessions; Roll never calls a Pi API; every handoff is file/event based; the
Evaluator report is attributable to a distinct opaque role token; and concrete Pi
model identities stay local/evidence-only. It does **not** prove Pi session
freshness or model execution.

## Known Failure Modes — stop / escalate (design §11)

Every block carries delegation ID, story ID, role (when applicable), evidence
path, and a concrete next action. Never absorb a failure silently or as an agent
health-score change.

| Failure | What you do |
| --- | --- |
| **Preset missing / malformed / wrong host** | `prepare` fails non-zero with the preset path. Fix `~/.roll/delta-team/presets.yaml` (or reinstall the example); do not prepare. |
| **Live pool unavailable or stale** | Stop **before** `prepare`. Refresh the inventory or ask the owner to choose a host model. Never guess. |
| **User-pinned model unavailable** | Block `model_unavailable`. **Do not fall back.** Ask the owner to re-pin or relax the pin. |
| **Soft preference unavailable** | Only if constraints permit, use a valid fallback and record `availability-fallback` + reasons. Otherwise treat as no candidate. |
| **Required diversity cannot be met** | Block. Never collapse roles onto the same model under `require`. Escalate to the owner to widen the pool or relax diversity. |
| **Host role spawn fails** | Block `host_spawn_failed`. Preserve already-published artifacts. Do not silently retry another model/host; ask the owner. |
| **Attestation missing / malformed / conflicts** | `validate` blocks `host_attestation_invalid`. Preserve artifacts, label the claim unverified, and redelegate/re-attest or abandon. Never treat it as proof of freshness/execution. |
| **Identity collision** (empty/duplicate role-instance or session token; Evaluator token equals Builder's) | Block `identity_collision`. No next role or publish. Re-request the role with distinct tokens. Token inequality is structural only. |
| **Artifact invalid** (missing/malformed/digest-mismatched) | Fail closed at that role. No next stage. Re-request the role to author a correct artifact. |
| **Write violation** (Designer/Evaluator/Peer modifies product files) | Changes are preserved/quarantined; block `role_write_violation`. Re-request the role read-only. |
| **Two Builders contend for the worktree** | The lease guard rejects the second: `builder_lease_conflict`. Ensure exactly one Builder. |
| **Peer absent / fails** | Continue only if the profile's Peer is optional; surface a visible skipped/blocked reason. Peer absence is never represented as an Evaluator result. |
| **Evaluator blocks** (`repair` / `resize` / `hold` / `escalate`) | Validate the report, conclude as blocked (`owner_hold` / `owner_redelegate`), pause and escalate to the owner. **No** automatic repair loop in this epic. |
| **Terminal path not owner-approved** | `conclude` blocks `terminal_path_unselected`. Get the owner's disposition; create no cycle/run/terminal/attest/PR/DeliveryRecord/Done. |
| **Uncommitted delegation frame** (prepare crashed before events) | `roll delta status` reports `unknown: uncommitted_delegation_frame`. Never overwrite or adopt it; run explicit owner-confirmed recovery before releasing the lease. |
| **Loop-autonomous delta-team with no host** | Blocked `host_supervisor_required`. No conversion, no host spawn. An external host Supervisor may later consume it host-guided. |

## Command reference

```text
roll delta prepare  <story-id> --trigger host-guided --topology delta-team
                    --profile standard|verified|designed --preset <local-id>
                    --resolution <host-produced-json> [--json]
roll delta validate --delegation <id> --stage designer|builder|evaluator|peer [--json]
roll delta conclude --delegation <id>
                    --delivery-disposition owner_continue|owner_hold|owner_redelegate [--json]
roll delta status   [--story <id> | --delegation <id>] [--json]
roll delta help
```

`prepare` allocates and never spawns/creates a cycle. `validate` appends
`delta:role_started` + `delta:artifact_published`, or `delta:blocked` (non-zero).
`conclude` records the owner-approved Option C terminal. `status` is a read-only
projection: unknown renders `?`, session/model fields are labeled `host-attested`
(not verified execution), and cost is `? (host_unobservable)`.

## Evidence

The host-facing command procedure (`prepare` → `validate` per stage →
`status` → `conclude`) is the user-visible surface; capture its terminal output
as delivery evidence. Store only final artifact/event/host-attestation references
and the terminal capture — **never** conversations. Verification language is
"host-attested / structurally valid," never "Roll proved a fresh session ran" or
"the model executed."

## Maintenance

- Description changes require an update in `route-cases/skills.json`.
- Keep concrete host model IDs confined to the machine-local
  `presets.yaml.example`; never let them leak into repo config or `@roll/core`.
- New observed failure paths add a row to Failure modes with the concrete owner /
  Supervisor next action.
