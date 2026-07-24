#!/usr/bin/env node

import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSkills, parseSkillFile } from "./audit-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "skill-audit");
const routeSource = path.join(root, "route-cases", "skills.json");

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

const fixtureReport = auditSkills({
  skillsDir: fixtureRoot,
  routeFile: path.join(fixtureRoot, "route-cases.json"),
});
assert.equal(fixtureReport.summary.skills, 4);
assert.equal(fixtureReport.skills.find((skill) => skill.name === "minimal-skill").violations.includes("gotchas-missing"), true);
assert.equal(fixtureReport.skills.find((skill) => skill.name === "spoke-skill").violations.length, 0);

const liveReport = auditSkills({ skillsDir: root, routeFile: routeSource });
assert.equal(liveReport.summary.violations, 0);
assert.equal(liveReport.summary.workspaceHandoffRegistryViolations, 0);
assert.equal(liveReport.summary.workspaceHandoffCaseFailures, 0);

function auditMutatedFixture({ skillName = "roll-build", mutateSkill, mutateRoutes, addCarrier } = {}) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "roll-skill-handoff-audit-"));
  try {
    const skillDir = path.join(tempRoot, skillName);
    cpSync(path.join(root, skillName), skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    if (mutateSkill !== undefined) writeFileSync(skillFile, mutateSkill(readFileSync(skillFile, "utf8")), "utf8");
    if (addCarrier !== undefined) {
      const carrierFile = path.join(skillDir, addCarrier.path);
      if (addCarrier.path === "SKILL.md") appendFileSync(carrierFile, addCarrier.text, "utf8");
      else {
        mkdirSync(path.dirname(carrierFile), { recursive: true });
        writeFileSync(carrierFile, addCarrier.text, "utf8");
      }
    }

    const routes = JSON.parse(readFileSync(routeSource, "utf8"));
    routes.skillOperations = routes.skillOperations.filter((entry) => entry.id === skillName);
    routes.workspaceContextPolicies = routes.workspaceContextPolicies.filter((policy) => policy.id === skillName);
    routes.workspaceHandoffCases = routes.workspaceHandoffCases.filter((bundle) => bundle.id === skillName);
    routes.skills = { [skillName]: routes.skills[skillName] };
    mutateRoutes?.(routes);
    const routeFile = path.join(tempRoot, "route-cases.json");
    writeFileSync(routeFile, `${JSON.stringify(routes, null, 2)}\n`, "utf8");
    const report = auditSkills({ skillsDir: tempRoot, routeFile });
    return {
      report,
      violations: [
        ...report.skills[0].workspaceHandoffViolations,
        ...report.workspaceHandoffRegistryViolations,
      ],
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const missingSection = auditMutatedFixture({
  mutateSkill: (skill) => skill.replace(/\n## Workspace Execution Handoff[\s\S]*?(?=\n## Context Snapshot Handoff)/u, ""),
});
assert.ok(missingSection.violations.includes("workspace-handoff-section-missing"));

const policyMismatch = auditMutatedFixture({
  mutateSkill: (skill) => skill.replace("workspace-context-scope: issue_required", "workspace-context-scope: workspace_required_read"),
});
assert.ok(policyMismatch.violations.includes("workspace-handoff-policy-mismatch:scope"));

const missingPolicy = auditMutatedFixture({
  mutateRoutes: (routes) => { routes.workspaceContextPolicies = []; },
});
assert.ok(missingPolicy.violations.includes("workspace-policy-family-inventory-mismatch"));
assert.ok(missingPolicy.violations.includes("workspace-policy-handoff-bundle-mismatch"));

const orphanBundle = auditMutatedFixture({
  mutateRoutes: (routes) => routes.workspaceHandoffCases.push({ id: "roll-build", operation: "orphan", proofProfile: "issue_required:mutation" }),
});
assert.ok(orphanBundle.violations.includes("workspace-handoff-cases-orphan:orphan"));
assert.ok(orphanBundle.violations.includes("workspace-policy-handoff-bundle-mismatch"));

const duplicatePolicy = auditMutatedFixture({
  mutateRoutes: (routes) => routes.workspaceContextPolicies.push(structuredClone(routes.workspaceContextPolicies[0])),
});
assert.ok(duplicatePolicy.violations.includes("workspace-policy-operation-duplicate"));

const missingRationale = auditMutatedFixture({
  skillName: "roll-doctor",
  mutateRoutes: (routes) => { delete routes.workspaceContextPolicies[0].rationale; },
});
assert.ok(missingRationale.violations.includes("workspace-handoff-policy-rationale-missing"));

const invalidContextFixture = auditMutatedFixture({
  mutateRoutes: (routes) => {
    routes.workspaceExecutionContextFixtures.issue.resolution.evidence = [
      { kind: "issue_exact", value: "US-WS-037", hard: true, score: 100 },
    ];
  },
});
assert.ok(invalidContextFixture.violations.some((violation) =>
  violation.startsWith("workspace-handoff-case-decision-invalid:build:")));

const staleAuthority = auditMutatedFixture({
  addCarrier: { path: "references/handoff-regression.md", text: "Use .roll/backlog.md as the source of truth.\nRun roll init before delivery.\n" },
});
assert.ok(staleAuthority.violations.some((violation) => violation.startsWith("stale-workspace-authority:")));
assert.ok(staleAuthority.violations.some((violation) => violation.startsWith("public-workspace-init:")));

const hiddenAmbientAuthorities = auditMutatedFixture({
  addCarrier: {
    path: "references/handoff-regression.md",
    text: [
      "Resolve the project authority with pwd -P.",
      "Read ~/.shared/roll/loop/runs.jsonl for runtime truth.",
      "Run git -C .roll status before continuing.",
    ].join("\n"),
  },
});
assert.ok(hiddenAmbientAuthorities.violations.some((violation) => violation.startsWith("ambient-pwd-authority:")));
assert.ok(hiddenAmbientAuthorities.violations.some((violation) => violation.startsWith("fixed-loop-runtime-authority:")));
assert.ok(hiddenAmbientAuthorities.violations.some((violation) => violation.startsWith("repository-local-roll-authority:")));

const declaredPlaceholder = auditMutatedFixture({
  addCarrier: {
    path: "references/handoff-placeholder.md",
    text: "Every relative `.roll` path in this carrier resolves from `context.authorities` and is never joined to cwd.\nRead .roll/backlog.md through that authority.\n",
  },
});
assert.equal(declaredPlaceholder.violations.some((violation) => violation.startsWith("stale-workspace-authority:")), false);

const placeholderCannotMaskCommand = auditMutatedFixture({
  addCarrier: {
    path: "references/handoff-placeholder-command.md",
    text: "Every relative `.roll` path in this carrier resolves from `context.authorities` and is never joined to cwd.\ngit add .roll/backlog.md\n",
  },
});
assert.ok(placeholderCannotMaskCommand.violations.some((violation) => violation.startsWith("relative-roll-command:")));

const workspaceMutationCannotPushMain = auditMutatedFixture({
  skillName: "roll-.dream",
  addCarrier: { path: "references/handoff-main-push.md", text: "git push origin main\n" },
});
assert.ok(workspaceMutationCannotPushMain.violations.some((violation) => violation.startsWith("ambient-main-push:")));

const wrongMachineDeclaration = auditMutatedFixture({
  skillName: "roll-ws-create",
  mutateSkill: (skill) => skill.replace("workspace-execution-handoff: machine_create_required", "workspace-execution-handoff: required"),
});
assert.ok(wrongMachineDeclaration.violations.includes("workspace-handoff-declaration-missing"));

console.log("audit-skills tests passed");
