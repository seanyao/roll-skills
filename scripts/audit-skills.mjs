#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    return {
      ...skill,
      routeCoverage: {
        positiveCount: routeCoverage.positive.length,
        negativeCount: routeCoverage.negative.length,
        hasMinimumCoverage: routeCoverage.hasMinimumCoverage,
      },
      violations: violationsFor(skill, routeCoverage),
    };
  });

  const summary = {
    skills: skills.length,
    violations: skills.reduce((count, skill) => count + skill.violations.length, 0),
    over250: skills.filter((skill) => skill.lines > 250).length,
    withGotchas: skills.filter((skill) => skill.hasGotchas).length,
    loadTriggerDescriptions: skills.filter((skill) => skill.descriptionLoadTrigger).length,
    withAuxiliaryFiles: skills.filter((skill) => skill.spokeFiles.length > 0).length,
  };

  return { summary, skills };
}

function printHuman(report) {
  console.log(`Skill audit: ${report.summary.skills} skills`);
  console.log(`Load-trigger descriptions: ${report.summary.loadTriggerDescriptions}/${report.summary.skills}`);
  console.log(`Gotchas coverage: ${report.summary.withGotchas}/${report.summary.skills}`);
  console.log(`Skills over 250 lines: ${report.summary.over250}`);
  console.log(`Skills with auxiliary files: ${report.summary.withAuxiliaryFiles}`);
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
