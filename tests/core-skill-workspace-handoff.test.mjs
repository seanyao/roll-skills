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
});
