import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditSkills, evaluateWorkspaceHandoffCase } from "../scripts/audit-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreFamilies = [
  "roll-design",
  "roll-build",
  "roll-fix",
  "roll-loop",
  "roll-prime",
  "roll-ws-create",
];

const requiredAuthorityCategories = {
  "roll-design": ["backlog", "design", "evidence", "features", "runtime"],
  "roll-build": ["backlog", "design", "evidence", "features", "policy", "runtime"],
  "roll-fix": ["backlog", "design", "evidence", "features", "policy", "runtime"],
  "roll-loop": ["backlog", "design", "events", "evidence", "features", "locks", "policy", "runtime"],
  "roll-prime": ["backlog", "design", "events", "evidence", "features", "policy", "runtime"],
  "roll-ws-create": [],
};

test("core delivery skills expose a complete Workspace execution handoff contract", () => {
  const report = auditSkills({
    skillsDir: root,
    routeFile: path.join(root, "route-cases", "skills.json"),
  });

  assert.equal(report.summary.workspaceHandoffViolations, 0);
  for (const family of coreFamilies) {
    const skill = report.skills.find((candidate) => candidate.name === family);
    assert.ok(skill, `missing audited core family ${family}`);
    assert.deepEqual(skill.workspaceHandoffViolations, [], `${family} handoff contract must be complete`);
    assert.equal(typeof skill.workspaceAllowsAmbientCwd, "boolean", `${family} must declare ambient cwd policy`);
    assert.equal(typeof skill.workspaceAllowsLegacyRollPath, "boolean", `${family} must declare legacy path policy`);
    assert.deepEqual(
      skill.workspaceAuthorityCategories,
      requiredAuthorityCategories[family],
      `${family} must expose every authority category it consumes`,
    );
    assert.ok(skill.scannedFiles.includes("SKILL.md"), `${family} audit must report its hub carrier`);
    assert.ok(skill.scannedFiles.includes("route-cases/skills.json"), `${family} audit must report route cases`);
  }
  assert.equal(report.summary.scannedFiles, report.scannedFiles.length);
  assert.ok(report.scannedFiles.includes("roll-ws-create/agents/openai.yaml"));
});

test("all six core families execute the five Workspace handoff route proofs", () => {
  const report = auditSkills({
    skillsDir: root,
    routeFile: path.join(root, "route-cases", "skills.json"),
  });

  const results = coreFamilies.flatMap((family) => {
    const skill = report.skills.find((candidate) => candidate.name === family);
    assert.ok(skill, `missing audited core family ${family}`);
    assert.equal(skill.workspaceHandoffCaseResults.length, 5, `${family} must execute five route proofs`);
    return skill.workspaceHandoffCaseResults.map((result) => ({ family, ...result }));
  });

  assert.equal(results.length, 30);
  assert.equal(report.summary.workspaceHandoffCases, 30);
  assert.equal(report.summary.workspaceHandoffCaseFailures, 0);
  for (const result of results) {
    assert.equal(result.passed, true, `${result.family}:${result.case} failed: ${result.failures.join(", ")}`);
    assert.equal(result.actual, result.expected, `${result.family}:${result.case} outcome drifted`);
    assert.ok(result.proofs.length > 0, `${result.family}:${result.case} must report executable proofs`);
    assert.equal(typeof result.input, "object", `${result.family}:${result.case} must carry executable input`);
  }
});

test("deterministic handoff evaluator fails closed on missing, conflict, multi-repo, and rediscovery input", () => {
  const report = auditSkills({
    skillsDir: root,
    routeFile: path.join(root, "route-cases", "skills.json"),
  });
  const design = report.skills.find((skill) => skill.name === "roll-design");
  const build = report.skills.find((skill) => skill.name === "roll-build");
  const arbitrary = design.workspaceHandoffCaseResults.find((result) => result.case === "arbitrary_cwd").input;
  const multiRepo = build.workspaceHandoffCaseResults.find((result) => result.case === "multi_repo").input;

  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    promptContext: null,
  }).decision, "missing_execution_context");
  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    environmentContext: { ...arbitrary.environmentContext, workspaceId: "other" },
  }).decision, "workspace_context_conflict");
  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    environmentContext: {
      scope: arbitrary.environmentContext.scope,
      storyId: arbitrary.environmentContext.storyId,
      workspaceId: arbitrary.environmentContext.workspaceId,
      schema: arbitrary.environmentContext.schema,
    },
  }).decision, "use_handoff_authorities");
  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    environmentContext: "{",
  }).decision, "invalid_workspace_context");
  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    promptContext: { ...arbitrary.promptContext, scope: "workspace_required_read" },
    environmentContext: { ...arbitrary.environmentContext, scope: "workspace_required_read" },
  }, { expectedScope: "workspace_required_mutation" }).decision, "workspace_context_scope_mismatch");
  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    rediscoveryAttempted: true,
  }).decision, "workspace_rediscovery_forbidden");
  assert.equal(evaluateWorkspaceHandoffCase("roll-design", "arbitrary_cwd", {
    ...arbitrary,
    authorityCategories: arbitrary.authorityCategories.filter((category) => category !== "evidence"),
  }, {
    expectedScope: "workspace_required_mutation",
    expectedAuthorityCategories: requiredAuthorityCategories["roll-design"],
  }).decision, "authority_contract_incomplete");
  assert.equal(evaluateWorkspaceHandoffCase("roll-build", "multi_repo", multiRepo).decision, "stop_without_repository_selector");
  assert.equal(evaluateWorkspaceHandoffCase("roll-build", "multi_repo", {
    ...multiRepo,
    repositorySelector: "product",
  }).decision, "use_selected_repository");
});

test("machine-only Workspace creation uses an explicit create handoff from arbitrary cwd", () => {
  const report = auditSkills({
    skillsDir: root,
    routeFile: path.join(root, "route-cases", "skills.json"),
  });
  const createSkill = report.skills.find((candidate) => candidate.name === "roll-ws-create");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "route-cases", "skills.json"), "utf8"));
  assert.equal(createSkill.workspaceExecutionHandoff, "machine_create_required");
  assert.doesNotMatch(createSkill.workspaceHandoffSection, /repository (?:ID|id) or alias/iu);
  assert.deepEqual(manifest.workspaceHandoffCases["roll-ws-create"].map(({ case: caseName, expected }) => ({ case: caseName, expected })), [
    { case: "arbitrary_cwd", expected: "use_explicit_create_preview" },
    { case: "explicit_selector", expected: "use_explicit_create_identity" },
    { case: "requirement_mismatch", expected: "stop_and_route_workspace_target" },
    { case: "multi_repo", expected: "validate_all_create_config_bindings" },
    { case: "legacy_boundary", expected: "reconcile_named_legacy_journals_only" },
  ]);
  assert.deepEqual(createSkill.workspaceCreateContractChecks, {
    exactPreviewTuple: true,
    authorizationDigestMismatchFailsClosed: true,
    naturalLanguageCannotAuthorizeApply: true,
    retryPreservesTupleOrRequiresFreshAuthorization: true,
  });

  const explicit = createSkill.workspaceHandoffCaseResults.find((result) => result.case === "explicit_selector").input;
  const createPreview = createSkill.workspaceHandoffCaseResults.find((result) => result.case === "arbitrary_cwd").input;
  const optionalContext = {
    schema: "roll.workspace-execution-context/v1",
    workspaceId: "roll",
    storyId: null,
    scope: "machine_only",
  };
  assert.equal(evaluateWorkspaceHandoffCase("roll-ws-create", "arbitrary_cwd", {
    ...createPreview,
    promptContext: optionalContext,
  }).decision, "missing_execution_context");
  assert.equal(evaluateWorkspaceHandoffCase("roll-ws-create", "arbitrary_cwd", {
    ...createPreview,
    promptContext: optionalContext,
    environmentContext: { ...optionalContext, workspaceId: "other" },
  }).decision, "workspace_context_conflict");
  assert.equal(evaluateWorkspaceHandoffCase("roll-ws-create", "explicit_selector", {
    ...explicit,
    preview: { ...explicit.preview, planSha256: null },
  }).decision, "invalid_create_preview");
  assert.equal(evaluateWorkspaceHandoffCase("roll-ws-create", "explicit_selector", {
    ...explicit,
    authorization: { ...explicit.authorization, planSha256: "c".repeat(64) },
  }).decision, "fresh_preview_required");
  assert.equal(evaluateWorkspaceHandoffCase("roll-ws-create", "explicit_selector", {
    ...explicit,
    authorization: null,
    naturalLanguageIntentOnly: true,
  }).decision, "preview_only");
  assert.equal(evaluateWorkspaceHandoffCase("roll-ws-create", "explicit_selector", {
    ...explicit,
    retryPreview: { ...explicit.retryPreview, configSha256: "c".repeat(64) },
  }).decision, "fresh_preview_required");
});
