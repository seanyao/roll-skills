import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditSkills } from "../scripts/audit-skills.mjs";

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
    assert.equal(result.passed, true, `${result.family}:${result.case} failed: ${result.missingProofs.join(", ")}`);
    assert.equal(result.actual, result.expected, `${result.family}:${result.case} outcome drifted`);
    assert.ok(result.proofs.length > 0, `${result.family}:${result.case} must report executable proofs`);
  }

  for (const family of coreFamilies.filter((name) => name !== "roll-ws-create")) {
    const skill = report.skills.find((candidate) => candidate.name === family);
    const allProofs = new Set(skill.workspaceHandoffCaseResults.flatMap((result) => result.proofs));
    for (const proof of ["missing_context_fail_closed", "identity_conflict_fail_closed", "multi_repo_fail_closed", "no_rediscovery"]) {
      assert.ok(allProofs.has(proof), `${family} must execute proof ${proof}`);
    }
  }
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
  assert.deepEqual(manifest.workspaceHandoffCases["roll-ws-create"], [
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
});
