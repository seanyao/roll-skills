#!/usr/bin/env node

import assert from "node:assert/strict";
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

console.log("audit-skills tests passed");
