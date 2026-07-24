import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditSkills } from "../scripts/audit-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeFile = path.join(root, "route-cases", "skills.json");
const supportingFamilies = [
  "roll-.changelog",
  "roll-.clarify",
  "roll-.dream",
  "roll-.echo",
  "roll-.qa",
  "roll-.review",
  "roll-debug",
  "roll-doc-audit",
  "roll-doctor",
  "roll-idea",
  "roll-notes",
  "roll-onboard",
  "roll-peer",
  "roll-propose",
  "roll-review-pr",
  "roll-spar",
];

function loadManifest() {
  return JSON.parse(fs.readFileSync(routeFile, "utf8"));
}

test("all sixteen supporting skill families expose audited Workspace handoff contracts", () => {
  const report = auditSkills({ skillsDir: root, routeFile });

  assert.equal(report.skills.length, 22);
  assert.equal(supportingFamilies.length, 16);
  for (const family of supportingFamilies) {
    const skill = report.skills.find((candidate) => candidate.name === family);
    assert.ok(skill, `missing supporting family ${family}`);
    assert.notEqual(skill.workspaceExecutionHandoff, "", `${family} must declare its handoff mode`);
    assert.notEqual(skill.workspaceHandoffSection, "", `${family} must document its handoff contract`);
    assert.deepEqual(skill.workspaceHandoffViolations, [], `${family} handoff contract must be audited`);
  }
});

test("the handoff audit closes every family-operation policy with derived fail-closed proofs", () => {
  const manifest = loadManifest();
  const report = auditSkills({ skillsDir: root, routeFile });
  const policies = manifest.workspaceContextPolicies.filter(({ surface }) => surface === "skill");
  const policyKeys = policies.map(({ id, operation }) => `${id}:${operation}`);

  assert.equal(new Set(policyKeys).size, policyKeys.length, "family-operation policy rows must be unique");
  assert.deepEqual(
    [...new Set(policies.map(({ id }) => id))].sort(),
    report.skills.map(({ name }) => name).sort(),
    "all 22 shipped families must have policy rows",
  );

  for (const policy of policies) {
    const skill = report.skills.find(({ name }) => name === policy.id);
    const results = skill.workspaceHandoffCaseResults.filter(({ operation }) => operation === policy.operation);
    const cases = new Set(results.map((result) => result.case));
    assert.ok(results.length >= 5, `${policy.id}:${policy.operation} must execute its policy-derived proof obligations`);
    assert.ok(results.every((result) => result.passed), `${policy.id}:${policy.operation} proofs must pass`);
    if (!["machine_only", "legacy_migration_only", "workspace_optional_read"].includes(policy.scope) && policy.id !== "roll-ws-create") {
      assert.ok(cases.has("missing_context"), `${policy.id}:${policy.operation} must fail closed without context`);
      assert.ok(cases.has("same_story_different_workspace"), `${policy.id}:${policy.operation} must isolate identical Story IDs across Workspaces`);
    }
    if (policy.repositorySelector === "required") {
      for (const caseName of ["selected_repository", "missing_repository_selector", "unknown_repository_selector", "ambiguous_repository_selector"]) {
        assert.ok(cases.has(caseName), `${policy.id}:${policy.operation} missing ${caseName}`);
      }
    }
    if (policy.access === "read" && !["machine_only", "legacy_migration_only", "workspace_optional_read"].includes(policy.scope)) {
      assert.ok(cases.has("mutation_forbidden"), `${policy.id}:${policy.operation} must prove the read-only boundary`);
    }
    if (policy.access === "mutation" && policy.repositorySelector === "required") {
      assert.ok(cases.has("read_only_repository"), `${policy.id}:${policy.operation} must reject a read-only selected repository`);
    }
  }
  assert.equal(report.summary.workspaceHandoffCases, report.skills.flatMap(({ workspaceHandoffCaseResults }) => workspaceHandoffCaseResults).length);
  assert.equal(report.summary.workspaceHandoffCaseFailures, 0);
  assert.equal(report.summary.workspaceHandoffRegistryViolations, 0);
});
