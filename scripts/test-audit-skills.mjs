#!/usr/bin/env node

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function auditMutatedCoreFixture({ skillName = "roll-build", mutateSkill, mutateRoutes, addReference } = {}) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "roll-skill-handoff-audit-"));
  try {
    const skillDir = path.join(tempRoot, skillName);
    cpSync(path.join(root, skillName), skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    if (mutateSkill !== undefined) {
      writeFileSync(skillFile, mutateSkill(readFileSync(skillFile, "utf8")), "utf8");
    }
    if (addReference !== undefined) {
      writeFileSync(path.join(skillDir, "references", "handoff-regression.md"), addReference, "utf8");
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

const staleAuthority = auditMutatedCoreFixture({
  addReference: "Use .roll/backlog.md as the source of truth.\nRun roll init before delivery.\n",
});
assert.ok(staleAuthority.some((violation) => violation.startsWith("stale-workspace-authority:")));
assert.ok(staleAuthority.some((violation) => violation.startsWith("public-workspace-init:")));

const hiddenAmbientAuthorities = auditMutatedCoreFixture({
  addReference: [
    "Resolve the project authority with pwd -P.",
    "Read ~/.shared/roll/loop/runs.jsonl for runtime truth.",
    "Run git -C .roll status before continuing.",
  ].join("\n"),
});
assert.ok(hiddenAmbientAuthorities.some((violation) => violation.startsWith("ambient-pwd-authority:")));
assert.ok(hiddenAmbientAuthorities.some((violation) => violation.startsWith("fixed-loop-runtime-authority:")));
assert.ok(hiddenAmbientAuthorities.some((violation) => violation.startsWith("repository-local-roll-authority:")));

const dangerousLegacyInit = auditMutatedCoreFixture({
  addReference: "During legacy migration, run workspace-init to continue.\n",
});
assert.ok(dangerousLegacyInit.some((violation) => violation.startsWith("public-workspace-init:")));

const buildCannotClaimJournalException = auditMutatedCoreFixture({
  addReference: "Legacy journal recovery may reconcile named workspace-init records.\n",
});
assert.ok(buildCannotClaimJournalException.some((violation) => violation.startsWith("public-workspace-init:")));

const allowedCreateJournal = auditMutatedCoreFixture({
  skillName: "roll-ws-create",
  addReference: "Read and reconcile the named legacy workspace-init journal schema; never execute workspace-init.\n",
});
assert.deepEqual(allowedCreateJournal, []);

console.log("audit-skills tests passed");
