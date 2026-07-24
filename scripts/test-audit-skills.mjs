#!/usr/bin/env node

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSkills, parseSkillFile } from "./audit-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "skill-audit");

const quoted = parseSkillFile(path.join(fixtureRoot, "quoted-skill", "SKILL.md"));
assert.equal(quoted.name, "quoted-skill");
assert.equal(quoted.description, "Load when quoted scalar YAML should parse cleanly.");
assert.equal(quoted.descriptionLoadTrigger, true);

const block = parseSkillFile(path.join(fixtureRoot, "block-skill", "SKILL.md"));
assert.equal(block.name, "block-skill");
assert.match(block.description, /Load when block descriptions/);
assert.equal(block.descriptionLoadTrigger, true);

const minimal = parseSkillFile(path.join(fixtureRoot, "minimal-skill", "SKILL.md"));
assert.equal(minimal.hasGotchas, false);
assert.equal(minimal.hasWhenNotToUse, false);

const spoke = parseSkillFile(path.join(fixtureRoot, "spoke-skill", "SKILL.md"));
assert.deepEqual(spoke.spokeFiles, ["references/runbook.md"]);
assert.deepEqual(spoke.referencedSpokes, ["references/runbook.md"]);
assert.deepEqual(spoke.missingSpokeRefs, []);
assert.deepEqual(spoke.unreferencedSpokes, []);

const report = auditSkills({
  skillsDir: fixtureRoot,
  routeFile: path.join(fixtureRoot, "route-cases.json"),
});
assert.equal(report.summary.skills, 4);
assert.equal(report.skills.find((skill) => skill.name === "minimal-skill").violations.includes("gotchas-missing"), true);
assert.equal(report.skills.find((skill) => skill.name === "spoke-skill").violations.length, 0);

function auditMutatedCoreFixture({ skillName = "roll-build", mutateSkill, mutateRoutes, addCarrier } = {}) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "roll-skill-handoff-audit-"));
  try {
    const skillDir = path.join(tempRoot, skillName);
    cpSync(path.join(root, skillName), skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    if (mutateSkill !== undefined) {
      writeFileSync(skillFile, mutateSkill(readFileSync(skillFile, "utf8")), "utf8");
    }
    if (addCarrier !== undefined) {
      const carrierFile = path.join(skillDir, addCarrier.path);
      mkdirSync(path.dirname(carrierFile), { recursive: true });
      writeFileSync(carrierFile, addCarrier.text, "utf8");
    }

    const routes = JSON.parse(readFileSync(path.join(root, "route-cases", "skills.json"), "utf8"));
    mutateRoutes?.(routes);
    const routeFile = path.join(tempRoot, "route-cases.json");
    writeFileSync(routeFile, `${JSON.stringify(routes, null, 2)}\n`, "utf8");
    return auditSkills({ skillsDir: tempRoot, routeFile }).skills[0].workspaceHandoffViolations;
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const missingSection = auditMutatedCoreFixture({
  mutateSkill: (skill) => skill.replace(/\n## Workspace Execution Handoff[\s\S]*?(?=\n## Context Snapshot Handoff)/u, ""),
});
assert.ok(missingSection.includes("workspace-handoff-section-missing"));

const policyMismatch = auditMutatedCoreFixture({
  mutateSkill: (skill) => skill.replace("workspace-context-scope: issue_required", "workspace-context-scope: workspace_required_read"),
});
assert.ok(policyMismatch.includes("workspace-handoff-policy-mismatch:scope"));

const brokenTaxonomy = auditMutatedCoreFixture({
  mutateRoutes: (routes) => {
    routes.workspaceHandoffCases["roll-build"] = [
      { case: "arbitrary_cwd", expected: "use_handoff_authorities" },
      { case: "arbitrary_cwd", expected: "use_handoff_authorities" },
      { case: "unknown_case", expected: "continue" },
      { case: "explicit_selector", expected: "wrong_outcome" },
      { case: "multi_repo", expected: "stop_without_repository_selector" },
      { case: "legacy_boundary", expected: "legacy_migration_only" },
    ];
  },
});
assert.ok(brokenTaxonomy.includes("workspace-handoff-case-duplicate:arbitrary_cwd"));
assert.ok(brokenTaxonomy.includes("workspace-handoff-case-unknown:unknown_case"));
assert.ok(brokenTaxonomy.includes("workspace-handoff-case-outcome-invalid:explicit_selector"));
assert.ok(brokenTaxonomy.includes("workspace-handoff-case-missing:requirement_mismatch"));

const wrongFamilyOutcome = auditMutatedCoreFixture({
  mutateRoutes: (routes) => {
    routes.workspaceHandoffCases["roll-build"].find((item) => item.case === "arbitrary_cwd").expected =
      "use_explicit_create_handoff";
  },
});
assert.ok(wrongFamilyOutcome.includes("workspace-handoff-case-outcome-invalid:arbitrary_cwd"));

for (const [name, mutateRoutes, expectedViolation] of [
  [
    "missing prompt",
    (routes) => { routes.workspaceHandoffCases["roll-build"][0].input.promptContextFixture = null; },
    "workspace-handoff-case-execution-failed:arbitrary_cwd:missing_prompt_or_environment_context",
  ],
  [
    "prompt/env conflict",
    (routes) => {
      const conflict = structuredClone(routes.workspaceExecutionContextFixtures.issue);
      conflict.workspace.workspaceId = "other";
      conflict.issue.execution.workspaceId = "other";
      routes.workspaceHandoffCases["roll-build"][0].input.environmentContext = conflict;
    },
    "workspace-handoff-case-execution-failed:arbitrary_cwd:prompt_environment_context_conflict",
  ],
  [
    "policy scope drift",
    (routes) => {
      routes.workspaceHandoffCases["roll-build"][0].input.promptContextFixture = "workspace";
      routes.workspaceHandoffCases["roll-build"][0].input.environmentContextFixture = "workspace";
    },
    "workspace-handoff-case-execution-failed:arbitrary_cwd:context_scope_policy_mismatch",
  ],
  [
    "rediscovery",
    (routes) => { routes.workspaceHandoffCases["roll-build"][0].input.rediscoveryAttempted = true; },
    "workspace-handoff-case-execution-failed:arbitrary_cwd:rediscovery_attempted",
  ],
  [
    "legacy four-field match evidence",
    (routes) => {
      routes.workspaceExecutionContextFixtures.issue.resolution.evidence = [
        { kind: "issue_exact", value: "US-WS-037", hard: true, score: 100 },
      ];
    },
    "workspace-handoff-case-execution-failed:arbitrary_cwd:invalid_prompt_or_environment_context",
  ],
  [
    "requirement discovery without evidence",
    (routes) => {
      routes.workspaceExecutionContextFixtures.issue.resolution = {
        source: "requirement_discovery",
        evidence: [],
      };
    },
    "workspace-handoff-case-execution-failed:arbitrary_cwd:invalid_prompt_or_environment_context",
  ],
]) {
  const violations = auditMutatedCoreFixture({ mutateRoutes });
  assert.ok(violations.includes(expectedViolation), `${name} input mutation must fail closed`);
}

for (const source of ["explicit", "environment", "cwd_manifest"]) {
  const violations = auditMutatedCoreFixture({
    skillName: "roll-design",
    mutateRoutes: (routes) => {
      routes.workspaceExecutionContextFixtures.workspace.resolution = { source, evidence: [] };
    },
  });
  assert.equal(
    violations.some((violation) => violation.includes("invalid_prompt_or_environment_context")),
    false,
    `${source} resolution may carry an empty evidence array`,
  );
}

for (const [name, evidence] of [
  [
    "semantic evidence marked hard",
    { kind: "semantic_supported", value: "roll", hard: true, score: 10, source: "semantic-index:roll", provenance: "semantic_inference", detail: "Semantic term matched roll" },
  ],
  [
    "semantic evidence with non-semantic provenance",
    { kind: "semantic_supported", value: "roll", hard: false, score: 10, source: "semantic-index:roll", provenance: "explicit_user", detail: "Semantic term matched roll" },
  ],
  [
    "issue exact evidence inferred semantically",
    { kind: "issue_exact", value: "US-WS-037", hard: true, score: 100, source: "issue:US-WS-037", provenance: "semantic_inference", detail: "Issue matched" },
  ],
  [
    "requirement exact evidence inferred semantically",
    { kind: "requirement_source_exact", value: "jira:APE-234", hard: true, score: 90, source: "requirement:jira/APE-234", provenance: "semantic_inference", detail: "Requirement matched" },
  ],
  [
    "repository exact evidence inferred semantically",
    { kind: "repository_exact", value: "repo-product", hard: false, score: 30, source: "repository:repo-product", provenance: "semantic_inference", detail: "Repository matched" },
  ],
  [
    "path evidence inferred semantically",
    { kind: "path_contained", value: "/workspace/roll", hard: false, score: 20, source: "workspace-root:/workspace/roll", provenance: "semantic_inference", detail: "Path matched" },
  ],
]) {
  const violations = auditMutatedCoreFixture({
    mutateRoutes: (routes) => {
      routes.workspaceExecutionContextFixtures.issue.resolution.evidence = [evidence];
    },
  });
  assert.ok(
    violations.includes("workspace-handoff-case-execution-failed:arbitrary_cwd:invalid_prompt_or_environment_context"),
    `${name} must fail the product matcher compatibility matrix`,
  );
}

for (const [name, mutateInput, expectedDecision] of [
  ["authorization digest mismatch", (input) => { input.authorization.planSha256 = "c".repeat(64); }, "fresh_preview_required"],
  ["natural-language bypass", (input) => { input.authorization = null; input.naturalLanguageIntentOnly = true; }, "preview_only"],
  ["retry tuple drift", (input) => { input.retryPreview.configSha256 = "c".repeat(64); }, "fresh_preview_required"],
  ["authorization extra field", (input) => { input.authorization.unexpected = true; }, "invalid_create_authorization"],
  ["preview extra field", (input) => { input.preview.unexpected = true; }, "invalid_create_preview"],
  ["retry preview extra field", (input) => { input.retryPreview.unexpected = true; }, "invalid_create_preview"],
]) {
  const violations = auditMutatedCoreFixture({
    skillName: "roll-ws-create",
    mutateRoutes: (routes) => mutateInput(routes.workspaceHandoffCases["roll-ws-create"][1].input),
  });
  assert.ok(
    violations.includes(`workspace-handoff-case-decision-invalid:explicit_selector:${expectedDecision}`),
    `${name} input mutation must reject apply`,
  );
}

const staleAuthority = auditMutatedCoreFixture({
  addCarrier: { path: "references/handoff-regression.md", text: "Use .roll/backlog.md as the source of truth.\nRun roll init before delivery.\n" },
});
assert.ok(staleAuthority.some((violation) => violation.startsWith("stale-workspace-authority:")));
assert.ok(staleAuthority.some((violation) => violation.startsWith("public-workspace-init:")));

const hiddenAmbientAuthorities = auditMutatedCoreFixture({
  addCarrier: {
    path: "references/handoff-regression.md",
    text: [
      "Resolve the project authority with pwd -P.",
      "Read ~/.shared/roll/loop/runs.jsonl for runtime truth.",
      "Run git -C .roll status before continuing.",
    ].join("\n"),
  },
});
assert.ok(hiddenAmbientAuthorities.some((violation) => violation.startsWith("ambient-pwd-authority:")));
assert.ok(hiddenAmbientAuthorities.some((violation) => violation.startsWith("fixed-loop-runtime-authority:")));
assert.ok(hiddenAmbientAuthorities.some((violation) => violation.startsWith("repository-local-roll-authority:")));

for (const [text, violationPrefix] of [
  ["Do not inspect another Workspace, but resolve this authority with pwd -P.", "ambient-pwd-authority:"],
  ["Never delete another record, but read ~/.shared/roll/loop/runs.jsonl for runtime truth.", "fixed-loop-runtime-authority:"],
  ["Do not inspect another repository, but run git -C .roll status.", "repository-local-roll-authority:"],
]) {
  const violations = auditMutatedCoreFixture({
    addCarrier: { path: "references/handoff-regression.md", text: `${text}\n` },
  });
  assert.ok(violations.some((violation) => violation.startsWith(violationPrefix)), `mixed negation must not mask: ${text}`);
}

const dangerousLegacyInit = auditMutatedCoreFixture({
  addCarrier: { path: "references/handoff-regression.md", text: "During legacy migration, run workspace-init to continue.\n" },
});
assert.ok(dangerousLegacyInit.some((violation) => violation.startsWith("public-workspace-init:")));

const buildCannotClaimJournalException = auditMutatedCoreFixture({
  addCarrier: { path: "references/handoff-regression.md", text: "Legacy journal recovery may reconcile named workspace-init records.\n" },
});
assert.ok(buildCannotClaimJournalException.some((violation) => violation.startsWith("public-workspace-init:")));

const allowedCreateJournal = auditMutatedCoreFixture({
  skillName: "roll-ws-create",
  addCarrier: { path: "references/handoff-regression.md", text: "Read and reconcile the named legacy workspace-init journal schema.\n" },
});
assert.deepEqual(allowedCreateJournal, []);

for (const legacyText of [
  "Read the named legacy workspace-init journal, then start workspace-init.",
  "Read the named legacy workspace-init journal, then trigger workspace-init.",
  "Read the named legacy workspace-init journal and execute it.",
]) {
  const violations = auditMutatedCoreFixture({
    skillName: "roll-ws-create",
    addCarrier: { path: "references/handoff-regression.md", text: `${legacyText}\n` },
  });
  assert.ok(
    violations.some((violation) => violation.startsWith("public-workspace-init:")),
    `legacy journal allowlist must reject a trailing action: ${legacyText}`,
  );
}

for (const legacyText of [
  "Running workspace-init is forbidden.",
  "Launch workspace-init now.",
  "Do not execute workspace-init.",
  "Inspect the named old workspace-init journal.",
  "Read the workspace-init journal.",
]) {
  const violations = auditMutatedCoreFixture({
    skillName: "roll-ws-create",
    addCarrier: { path: "references/handoff-regression.md", text: `${legacyText}\n` },
  });
  assert.ok(violations.some((violation) => violation.startsWith("public-workspace-init:")), `legacy action must fail: ${legacyText}`);
}

const disguisedLegacyExecution = auditMutatedCoreFixture({
  skillName: "roll-ws-create",
  addCarrier: {
    path: "references/handoff-regression.md",
    text: "Read the named old workspace-init journal; never delete it, but execute workspace-init.\n",
  },
});
assert.ok(disguisedLegacyExecution.some((violation) => violation.startsWith("public-workspace-init:")));

const unavailablePathCannotMaskExecution = auditMutatedCoreFixture({
  skillName: "roll-ws-create",
  addCarrier: {
    path: "references/handoff-regression.md",
    text: "No public workspace-init path is offered, but execute workspace-init now.\n",
  },
});
assert.ok(unavailablePathCannotMaskExecution.some((violation) => violation.startsWith("public-workspace-init:")));

for (const authorityText of [
  "Use .roll/evidence/screenshots as the evidence authority.",
  "Use .roll/runtime/state as the runtime authority.",
  "Use .roll/custom-authority/data as the current Workspace authority.",
  "Use .roll as the current Workspace authority.",
  "Use ../.roll/evidence as the evidence authority.",
  "Use ../.roll as the current Workspace authority.",
  "Reconcile .roll meta after product truth.",
  "Do not scan another Workspace, but use .roll/backlog.md as the current Workspace authority.",
]) {
  const violations = auditMutatedCoreFixture({
    addCarrier: { path: "references/handoff-regression.md", text: `${authorityText}\n` },
  });
  assert.ok(
    violations.some((violation) => violation.startsWith("stale-workspace-authority:")),
    `cwd-relative authority must fail: ${authorityText}`,
  );
}

for (const [authorityText, violationPrefix] of [
  ["Do not inspect another Workspace, but consult $PWD for current authority.", "ambient-pwd-authority:"],
  ["Do not inspect another Workspace, then check pwd -P for current authority.", "ambient-pwd-authority:"],
  ["Never read another runtime, but consult ~/.shared/roll/loop/runs.jsonl for runtime truth.", "fixed-loop-runtime-authority:"],
  ["Never read another runtime, then check ~/.shared/roll/loop/runs.jsonl for runtime truth.", "fixed-loop-runtime-authority:"],
  ["Do not inspect another repository, but consult git -C .roll status.", "repository-local-roll-authority:"],
  ["Do not inspect another repository, then check git -C .roll status.", "repository-local-roll-authority:"],
  ["Do not inspect another Workspace, but consult .roll/backlog.md as the current Workspace authority.", "stale-workspace-authority:"],
  ["Do not inspect another Workspace, then check ../.roll as the current Workspace authority.", "stale-workspace-authority:"],
]) {
  const violations = auditMutatedCoreFixture({
    addCarrier: { path: "references/handoff-regression.md", text: `${authorityText}\n` },
  });
  assert.ok(
    violations.some((violation) => violation.startsWith(violationPrefix)),
    `negation must be local to the authority occurrence clause: ${authorityText}`,
  );
}

for (const carrierPath of [
  "SKILL.md",
  "references/injected.md",
  "scripts/injected",
  "assets/injected",
  "agents/openai.yaml",
]) {
  const violations = auditMutatedCoreFixture({
    addCarrier: { path: carrierPath, text: "Use .roll/backlog.md as the current Workspace authority.\n" },
  });
  assert.ok(
    violations.some((violation) => violation.startsWith("stale-workspace-authority:")),
    `${carrierPath} must be scanned as a Workspace contract carrier`,
  );
}

const routeCarrierViolation = auditMutatedCoreFixture({
  mutateRoutes: (routes) => {
    routes.skills["roll-build"].positive.push("Use .roll/backlog.md as the current Workspace authority.");
  },
});
assert.ok(routeCarrierViolation.some((violation) => violation.startsWith("stale-workspace-authority:route-cases/skills.json")));

const wrongMachineDeclaration = auditMutatedCoreFixture({
  skillName: "roll-ws-create",
  mutateSkill: (skill) => skill.replace(
    "workspace-execution-handoff: machine_create_required",
    "workspace-execution-handoff: required",
  ),
});
assert.ok(wrongMachineDeclaration.includes("workspace-handoff-declaration-missing"));

const machineReusesIssueContract = auditMutatedCoreFixture({
  skillName: "roll-ws-create",
  mutateSkill: (skill) => skill.replace(
    "## Workflow",
    "- Select a repository ID or alias from `context.issue.execution.repositories`.\n\n## Workflow",
  ),
});
assert.ok(machineReusesIssueContract.includes("workspace-handoff-machine-create-reuses-issue-contract"));

console.log("audit-skills tests passed");
