---
hidden: true
name: roll-.clarify
license: MIT
description: "Load when roll-build Fly mode input is vague or underspecified and the agent must ask targeted scope questions before planning or coding."
---
# roll-.clarify

## Gotchas

- This is for scope questions before planning; use roll-.echo when the immediate need is only intent restatement.
- Stop after asking questions; do not silently proceed into design or code while uncertainty remains.

> Understand first, build second.

## Trigger

Auto-invoked by `roll-build` (Fly mode) when the user input is:
- A single vague sentence
- Missing clear boundaries (what/who/when/where)
- Contains ambiguous terms like "优化一下", "改一下", "加个东西"
- Could be interpreted in multiple ways

The agent host may also invoke the narrow `workspace_target` route when
Workspace discovery or requirement validation returns a closed
`WorkspaceClarificationHandoffV1`. This route is not Fly-mode planning: it
clarifies one Workspace target decision and returns control to the host.

## When Not to Use

- Intent is already clear and actionable
- User gives a specific command with a skill trigger (e.g. `$roll-idea ...`)
- User is answering a clarification question you just asked
- The task is simple enough that misinterpretation risk is negligible
- User messy thoughts need restatement rather than questioning (use `$roll-.echo`)

## Behavior

1. **Summarize** the user's intent in 1–2 sentences.
2. **Assess complexity** (small / medium / large).
3. **Ask 3–5 targeted questions** to fill the biggest gaps. Focus on:
   - Scope: what exactly is in / out?
   - User: who is the actor?
   - Data: what changes or persists?
   - Edge cases: what could go wrong?
   - Verification: how will we know it's done?

### `workspace_target` route

Accept this route only when the input is a complete
`WorkspaceClarificationHandoffV1`. Do not infer missing candidates, actions,
registry revisions, or discovery facts.

1. Summarize the requirement and the handoff reason in 1–2 sentences.
2. Show every candidate's Workspace ID, lifecycle, evidence, and diagnostics.
   Candidate order is presentation only and is never an answer.
3. Offer only the actions present in `allowedActions`:
   - `select_existing`: ask for one listed candidate Workspace ID.
   - `create_new`: ask whether the user wants to begin collecting a Workspace
     ID and config for `roll workspace create <ID> --config <path> --check`.
   - `repair_discovery`: show only the handoff's canonical repair commands.
4. Ask one primary choice question and stop. Return a closed
   `WorkspaceClarificationAnswerV1` to the agent host after the user answers.

The host, not this skill, validates the answer against the current registry
revision and discovery facts digest. A valid `select_existing` answer only
authorizes the host to rerun Workspace resolution with an explicit canonical
selector. A valid `create_new` answer only starts ID/config collection and a
`--check` preview. It is not create apply authorization and must not apply,
activate, register, or otherwise mutate a Workspace. A valid
`repair_discovery` answer only displays canonical repair commands.

## Output format

```
🎯 Clarified Intent: {1-2 sentences}

📏 Complexity: {small|medium|large}

❓ Open Questions:
1. {question 1}
2. {question 2}
3. {question 3}
...

➡️  Please answer the questions above and I'll proceed to planning / building.
```

For `workspace_target`, use the following narrower form instead of the generic
3–5-question format:

```
🎯 Workspace target: {requirement summary and reason in 1–2 sentences}

Candidates:
- {workspaceId} ({lifecycle}): {evidence}; diagnostics: {diagnostics or none}

❓ Choose one allowed action: {one closed question derived from allowedActions}
```

Stop after the question. Do not append the generic planning/building handoff.

## Rules

- Do **not** start coding or planning until the user replies.
- Questions must be concrete and answerable in one sentence each.
- If the input is already clear enough, silently return and let `roll-build` continue.
- Never announce "I'm using roll-.clarify."
- `workspace_target` must not enter the `roll-build` planning/building tail.
- Never write a global current Workspace, registry, lifecycle event, manifest,
  config, journal, or Workspace directory from `workspace_target`.
- Never activate a registered or paused candidate. Selecting it only produces
  an explicit selector for host-side re-resolution; activation needs separate
  authorization.
- Never broaden `allowedActions`. In particular, ambiguity or requirement
  conflict cannot offer create; mutation discovery-incomplete can offer only
  repair; create intent can lead only to a canonical `--check` preview.
- Reject or reload stale/invalid answers through the host as
  `invalid_workspace_clarification`; never reuse old candidates or guess.
