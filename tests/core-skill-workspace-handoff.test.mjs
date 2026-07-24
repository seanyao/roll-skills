import assert from "node:assert/strict";
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
