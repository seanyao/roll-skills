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

test("the handoff audit closes every family-operation policy with five route proofs", () => {
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
    assert.equal(results.length, 5, `${policy.id}:${policy.operation} must execute five handoff route proofs`);
  }
  assert.equal(report.summary.workspaceHandoffCases, policies.length * 5);
  assert.equal(report.summary.workspaceHandoffCaseFailures, 0);
});
