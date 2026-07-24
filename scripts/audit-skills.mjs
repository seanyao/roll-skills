#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_WORKSPACE_HANDOFF_SKILLS = [
  "roll-design",
  "roll-build",
  "roll-fix",
  "roll-loop",
  "roll-prime",
  "roll-ws-create",
];

const WORKSPACE_HANDOFF_TAXONOMY = {
  arbitrary_cwd: new Set(["use_handoff_authorities", "use_explicit_create_handoff"]),
  explicit_selector: new Set(["use_verified_explicit_identity"]),
  requirement_mismatch: new Set(["stop_and_route_workspace_target"]),
  multi_repo: new Set(["stop_without_repository_selector"]),
  legacy_boundary: new Set(["legacy_migration_only", "legacy_journal_recovery_only"]),
};

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function stripYamlQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return { fields: {}, body: text, ok: false };
  }

  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    return { fields: {}, body: text, ok: false };
  }

  const raw = text.slice(4, end);
  const bodyStart = text.indexOf("\n", end + 4);
  const body = bodyStart === -1 ? "" : text.slice(bodyStart + 1);
  const fields = {};
  const lines = raw.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const blockMatch = line.match(/^([A-Za-z0-9_.-]+):\s*\|\s*$/);
    if (blockMatch) {
      const key = blockMatch[1];
      const blockLines = [];
      index += 1;
      while (index < lines.length) {
        const next = lines[index];
        if (/^\S[^:]*:/.test(next)) {
          index -= 1;
          break;
        }
        blockLines.push(next.replace(/^  ?/, ""));
        index += 1;
      }
      fields[key] = blockLines.join("\n").trim();
      continue;
    }

    const scalarMatch = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (scalarMatch) {
      fields[scalarMatch[1]] = stripYamlQuotes(scalarMatch[2]);
    }
  }

  return { fields, body, ok: true };
}

export function wordCount(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(full);
      if (entry.isFile()) return [full];
      return [];
    });
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function collectSpokeFiles(skillDir) {
  return ["references", "assets", "scripts"].flatMap((dirName) => {
    const base = path.join(skillDir, dirName);
    return walkFiles(base).map((file) => toPosix(path.relative(skillDir, file)));
  });
}

function collectReferencedSpokes(body) {
  const refs = new Set();
  const patterns = [
    /\]\(((?:references|assets|scripts)\/[^)#\s]+)(?:#[^)]+)?\)/g,
    /`((?:references|assets|scripts)\/[^`#]+)(?:#[^`]*)?`/g,
  ];

  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      refs.add(match[1].replace(/^\.\//, ""));
    }
  }

  return [...refs].sort();
}

function csv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

function frontmatterBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function extractHandoffSection(body) {
  const heading = body.match(/^## Workspace Execution Handoff\s*$/mu);
  if (heading?.index === undefined) return "";
  const afterHeading = body.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^##\s/mu);
  return (nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)).trim();
}

function collectContractText(skillDir) {
  return walkFiles(skillDir)
    .filter((file) => /\.(?:md|ya?ml|json|txt)$/u.test(file))
    .map((file) => ({ file, text: readText(file) }));
}

function legacyBoundaryLine(line) {
  return /legacy|historical|migration|journal|recovery|removed|retired|reject/iu.test(line);
}

function staleAuthorityViolations(skillDir) {
  const violations = [];
  for (const { file, text } of collectContractText(skillDir)) {
    const relative = toPosix(path.relative(skillDir, file));
    for (const [offset, line] of text.split(/\r?\n/u).entries()) {
      const location = `${relative}:${offset + 1}`;
      const explicitlyForbidden = /forbid|forbidden|never|must not|do not|instead of|rather than/iu.test(line);
      if (
        /\.roll\/(?:backlog\.md|features\/|design\/|domain\/|loop\/)/u.test(line) &&
        !legacyBoundaryLine(line) &&
        !explicitlyForbidden
      ) {
        violations.push(`stale-workspace-authority:${location}`);
      }
      if (/\$\{ROLL_MAIN_PROJECT:-\$PWD\}|\$PWD/u.test(line) && !explicitlyForbidden) {
        violations.push(`ambient-pwd-authority:${location}`);
      }
      if (/\broll (?:workspace )?init\b|workspace-init/iu.test(line) && !legacyBoundaryLine(line)) {
        violations.push(`public-workspace-init:${location}`);
      }
      if (/global current Workspace/iu.test(line) && !/no |not |never |does not |without /iu.test(line)) {
        violations.push(`global-current-workspace:${location}`);
      }
    }
  }
  return violations;
}

export function parseSkillFile(file) {
  const text = readText(file);
  const { fields, body, ok } = parseFrontmatter(text);
  const skillDir = path.dirname(file);
  const description = fields.description ?? "";
  const spokeFiles = collectSpokeFiles(skillDir);
  const referencedSpokes = collectReferencedSpokes(body);

  return {
    name: fields.name ?? path.basename(skillDir),
    file,
    frontmatterOk: ok,
    lines: text.trimEnd().split(/\r?\n/).length,
    description,
    descriptionWordCount: wordCount(description),
    descriptionLoadTrigger: /^Load when\b/i.test(description),
    hasWhenNotToUse: /^##\s+When Not to Use\b/im.test(body),
    hasGotchas: /^##\s+(Gotchas|Known Failure Modes)\b/im.test(body),
    hasReviewedWaiver: /Reviewed Waiver:/i.test(body),
    auxiliaryDirs: ["scripts", "references", "assets"].filter((dirName) =>
      fs.existsSync(path.join(skillDir, dirName)),
    ),
    spokeFiles,
    referencedSpokes,
    missingSpokeRefs: referencedSpokes.filter((ref) => !spokeFiles.includes(ref)),
    unreferencedSpokes: spokeFiles.filter((filePath) => !referencedSpokes.includes(filePath)),
    workspaceExecutionHandoff: fields["workspace-execution-handoff"] ?? "",
    workspaceContextScope: fields["workspace-context-scope"] ?? "",
    workspaceContextConsumer: fields["workspace-context-consumer"] ?? "",
    workspaceContextOperations: csv(fields["workspace-context-operations"]),
    workspaceAllowsAmbientCwd: frontmatterBoolean(fields["workspace-allows-ambient-cwd"]),
    workspaceAllowsLegacyRollPath: frontmatterBoolean(fields["workspace-allows-legacy-roll-path"]),
    workspaceHandoffSection: extractHandoffSection(body),
  };
}

export function findSkillFiles(skillsDir) {
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, "SKILL.md"))
    .filter((file) => fs.existsSync(file))
    .sort();
}

function loadRouteCases(routeFile) {
  if (!fs.existsSync(routeFile)) {
    return { skills: {} };
  }
  return JSON.parse(readText(routeFile));
}

function routeCoverageFor(skillName, routes) {
  const entry = routes.skills?.[skillName] ?? {};
  const positive = Array.isArray(entry.positive) ? entry.positive : [];
  const negative = Array.isArray(entry.negative) ? entry.negative : [];
  return {
    positive,
    negative,
    hasMinimumCoverage: positive.length >= 2 && negative.length >= 2,
  };
}

function workspaceHandoffViolationsFor(skill, routes) {
  if (!CORE_WORKSPACE_HANDOFF_SKILLS.includes(skill.name)) return [];

  const violations = [];
  const policies = (routes.workspaceContextPolicies ?? []).filter((policy) => policy.id === skill.name);
  const policyOperations = policies.map((policy) => policy.operation).sort();
  const policyScopes = [...new Set(policies.map((policy) => policy.scope))];
  const policyConsumers = [...new Set(policies.map((policy) => policy.contextConsumer ?? ""))];
  const ambientPolicies = [...new Set(policies.map((policy) => policy.allowsAmbientCwd))];
  const legacyPolicies = [...new Set(policies.map((policy) => policy.allowsLegacyRollPath))];

  if (skill.workspaceExecutionHandoff !== "required") violations.push("workspace-handoff-declaration-missing");
  if (policyScopes.length !== 1 || skill.workspaceContextScope !== policyScopes[0]) {
    violations.push("workspace-handoff-policy-mismatch:scope");
  }
  if (policyConsumers.length !== 1 || skill.workspaceContextConsumer !== policyConsumers[0]) {
    violations.push("workspace-handoff-policy-mismatch:consumer");
  }
  if (JSON.stringify(skill.workspaceContextOperations) !== JSON.stringify(policyOperations)) {
    violations.push("workspace-handoff-policy-mismatch:operations");
  }
  if (ambientPolicies.length !== 1 || skill.workspaceAllowsAmbientCwd !== ambientPolicies[0]) {
    violations.push("workspace-handoff-policy-mismatch:allowsAmbientCwd");
  }
  if (legacyPolicies.length !== 1 || skill.workspaceAllowsLegacyRollPath !== legacyPolicies[0]) {
    violations.push("workspace-handoff-policy-mismatch:allowsLegacyRollPath");
  }

  const section = skill.workspaceHandoffSection;
  if (section === "") {
    violations.push("workspace-handoff-section-missing");
  } else {
    const requiredMarkers = [
      ["prompt-block", /prompt block/iu],
      ["environment", /ROLL_WORKSPACE_EXECUTION_CONTEXT/u],
      ["semantic-equality", /semantically identical/iu],
      ["fail-closed", /missing[\s\S]*invalid JSON[\s\S]*schema mismatch[\s\S]*Workspace mismatch[\s\S]*Story mismatch[\s\S]*scope mismatch[\s\S]*STOP/iu],
      ["authorities", /context\.authorities/u],
      ["repositories", /issue\.execution\.repositories/u],
      ["multi-repo-selector", /repository (?:ID|id) or alias/iu],
      ["clarify-route", /roll-\.clarify workspace_target/u],
      ["no-rediscovery", /(?:do not|never)[^.\n]*(?:rediscover|discovery)[^.\n]*(?:cwd|\.roll)/iu],
      ["identity-continuity", /retry[^.\n]*continuation[^.\n]*same[^.\n]*(?:Workspace|workspace)[^.\n]*(?:Issue|Story|story)/iu],
      ["legacy-boundary", /legacy[^.\n]*(?:migration|journal|recovery)/iu],
    ];
    for (const [name, pattern] of requiredMarkers) {
      if (!pattern.test(section)) violations.push(`workspace-handoff-marker-missing:${name}`);
    }
  }

  const cases = routes.workspaceHandoffCases?.[skill.name];
  if (!Array.isArray(cases)) {
    violations.push("workspace-handoff-cases-missing");
  } else {
    const seen = new Set();
    for (const item of cases) {
      const taxonomy = item?.case;
      if (!Object.hasOwn(WORKSPACE_HANDOFF_TAXONOMY, taxonomy)) {
        violations.push(`workspace-handoff-case-unknown:${String(taxonomy)}`);
        continue;
      }
      if (seen.has(taxonomy)) violations.push(`workspace-handoff-case-duplicate:${taxonomy}`);
      seen.add(taxonomy);
      if (!WORKSPACE_HANDOFF_TAXONOMY[taxonomy].has(item?.expected)) {
        violations.push(`workspace-handoff-case-outcome-invalid:${taxonomy}`);
      }
    }
    for (const taxonomy of Object.keys(WORKSPACE_HANDOFF_TAXONOMY)) {
      if (!seen.has(taxonomy)) violations.push(`workspace-handoff-case-missing:${taxonomy}`);
    }
  }

  violations.push(...staleAuthorityViolations(path.dirname(skill.file)));
  return violations;
}

function violationsFor(skill, routeCoverage) {
  const violations = [];

  if (!skill.frontmatterOk) violations.push("frontmatter-missing-or-invalid");
  if (!skill.descriptionLoadTrigger) violations.push("description-not-load-trigger");
  if (skill.descriptionWordCount > 50) violations.push("description-over-50-words");
  if (!routeCoverage.hasMinimumCoverage) violations.push("route-fixture-coverage-missing");
  if (!skill.hasGotchas) violations.push("gotchas-missing");
  if (skill.lines > 250 && !skill.hasReviewedWaiver) violations.push("hub-over-250-lines");
  for (const missing of skill.missingSpokeRefs) violations.push(`missing-spoke-ref:${missing}`);
  for (const extra of skill.unreferencedSpokes) violations.push(`unreferenced-spoke:${extra}`);

  return violations;
}

export function auditSkills({ skillsDir, routeFile }) {
  const routes = loadRouteCases(routeFile);
  const skills = findSkillFiles(skillsDir).map((file) => {
    const skill = parseSkillFile(file);
    const routeCoverage = routeCoverageFor(skill.name, routes);
    const workspaceHandoffViolations = workspaceHandoffViolationsFor(skill, routes);
    return {
      ...skill,
      routeCoverage: {
        positiveCount: routeCoverage.positive.length,
        negativeCount: routeCoverage.negative.length,
        hasMinimumCoverage: routeCoverage.hasMinimumCoverage,
      },
      workspaceHandoffViolations,
      violations: [...violationsFor(skill, routeCoverage), ...workspaceHandoffViolations],
    };
  });

  const summary = {
    skills: skills.length,
    violations: skills.reduce((count, skill) => count + skill.violations.length, 0),
    over250: skills.filter((skill) => skill.lines > 250).length,
    withGotchas: skills.filter((skill) => skill.hasGotchas).length,
    loadTriggerDescriptions: skills.filter((skill) => skill.descriptionLoadTrigger).length,
    withAuxiliaryFiles: skills.filter((skill) => skill.spokeFiles.length > 0).length,
    workspaceHandoffViolations: skills.reduce(
      (count, skill) => count + skill.workspaceHandoffViolations.length,
      0,
    ),
  };

  return { summary, skills };
}

function printHuman(report) {
  console.log(`Skill audit: ${report.summary.skills} skills`);
  console.log(`Load-trigger descriptions: ${report.summary.loadTriggerDescriptions}/${report.summary.skills}`);
  console.log(`Gotchas coverage: ${report.summary.withGotchas}/${report.summary.skills}`);
  console.log(`Skills over 250 lines: ${report.summary.over250}`);
  console.log(`Skills with auxiliary files: ${report.summary.withAuxiliaryFiles}`);
  console.log(`Workspace handoff violations: ${report.summary.workspaceHandoffViolations}`);
  console.log(`Violations: ${report.summary.violations}`);

  for (const skill of report.skills) {
    const markers = [];
    markers.push(`${skill.lines} lines`);
    markers.push(`${skill.descriptionWordCount} desc words`);
    markers.push(`${skill.routeCoverage.positiveCount}+/${skill.routeCoverage.negativeCount}- route cases`);
    if (skill.spokeFiles.length > 0) markers.push(`${skill.spokeFiles.length} spokes`);
    const status = skill.violations.length === 0 ? "ok" : skill.violations.join(", ");
    console.log(`- ${skill.name}: ${status} (${markers.join("; ")})`);
  }
}

function parseArgs(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const options = {
    skillsDir: root,
    routeFile: path.join(root, "route-cases", "skills.json"),
    json: false,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--skills-dir") {
      index += 1;
      options.skillsDir = path.resolve(argv[index]);
    } else if (arg === "--routes") {
      index += 1;
      options.routeFile = path.resolve(argv[index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = auditSkills(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (options.strict && report.summary.violations > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
