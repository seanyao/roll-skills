#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE_REQUIREMENT_FAILURE_CODES = new Set([
  "requirement_match_required",
  "ambiguous_requirement_match",
  "requirement_workspace_conflict",
  "workspace_discovery_incomplete",
]);

const REQUIRED_AUTHORITY_CATEGORIES = {
  "roll-design": ["backlog", "design", "evidence", "features", "runtime"],
  "roll-build": ["backlog", "design", "evidence", "features", "policy", "runtime"],
  "roll-fix": ["backlog", "design", "evidence", "features", "policy", "runtime"],
  "roll-loop": ["backlog", "design", "events", "evidence", "features", "locks", "policy", "runtime"],
  "roll-prime": ["backlog", "design", "events", "evidence", "features", "policy", "runtime"],
  "roll-ws-create": [],
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
    .map((file) => {
      const content = fs.readFileSync(file);
      return {
        file,
        relative: toPosix(path.relative(skillDir, file)),
        text: content.includes(0) ? "" : content.toString("utf8"),
      };
    });
}

function routeCaseContractText(skillName, routes) {
  return {
    file: "route-cases/skills.json",
    relative: "route-cases/skills.json",
    text: JSON.stringify({
      authorityBoundary: "Every relative `.roll` path in this carrier resolves from `context.authorities` and is never joined to cwd.",
      skillOperations: routes.skillOperations?.find((entry) => entry.id === skillName) ?? null,
      workspaceContextPolicies: (routes.workspaceContextPolicies ?? []).filter((policy) => policy.id === skillName),
      workspaceExecutionContextFixtures: routes.workspaceExecutionContextFixtures ?? null,
      workspaceHandoffCases: Array.isArray(routes.workspaceHandoffCases)
        ? routes.workspaceHandoffCases.filter((entry) => entry.id === skillName)
        : null,
      routes: routes.skills?.[skillName] ?? null,
    }, null, 2),
  };
}

function explicitlyRejects(line, matchIndex) {
  return /(?:forbid(?:s|den)?|never|must not|do not|instead of|rather than)\b[^.;]*$/iu.test(
    line.slice(0, matchIndex),
  );
}

function normalizedContractSentence(sentence) {
  return sentence
    .replace(/[`*_]/gu, "")
    .replace(/^\s*(?:[-+]\s+|\d+\.\s+)/u, "")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[.!?。！？]+$/gu, "")
    .toLocaleLowerCase("en-US");
}

function sentenceAt(line, targetIndex) {
  const boundaries = [...line.matchAll(/[.!?。！？]+/gu)];
  let start = 0;
  let end = line.length;
  for (const boundary of boundaries) {
    if (boundary.index === undefined) continue;
    if (boundary.index < targetIndex) start = boundary.index + boundary[0].length;
    else {
      end = boundary.index + boundary[0].length;
      break;
    }
  }
  return line.slice(start, end);
}

function allowedLegacyJournalReference(skillName, line, initIndex) {
  if (skillName !== "roll-ws-create") return false;
  const sentence = sentenceAt(line, initIndex);
  if ([...sentence.matchAll(/\b(?:roll (?:workspace )?init|workspace[ -]init)\b/giu)].length !== 1) return false;
  return /^(?:(?:read|reconcile)|read and reconcile|reconcile and read) the named (?:old|historical|legacy) workspace-init (?:journal|journal schema|repair journal|repair journal schema)$/u.test(
    normalizedContractSentence(sentence),
  );
}

function authorityLineIsAllowed(line) {
  const normalized = normalizedContractSentence(line);
  const singleTarget = /(?:\$pwd|\$\{roll_main_project:-\$pwd\}|pwd -p|~\/\.shared\/roll\/loop\/[a-z0-9._/-]+|git -c \.roll status|(?:\.\.\/)?\.roll(?:\/[a-z0-9._/-]+)?)/u;
  return [
    /^never derive authority from the shell cwd, a repository root, or a nearby \.roll directory$/u,
    /^do not rediscover from cwd or \.roll, activate a workspace, or (?:create one inside this skill|apply creation from the clarification answer)$/u,
    /^never derive authority from a repository-local \.roll directory$/u,
    /^do not rediscover authority from cwd or \.roll\b/u,
    /^under roll-loop, the builder must not edit shared \.roll completion status$/u,
    new RegExp(`^(?:do not|never) derive authority from ${singleTarget.source}$`, "u"),
  ].some((pattern) => pattern.test(normalized));
}

function staleAuthorityViolations(skillName, contractTexts, { legacyBoundary = false, policies = [] } = {}) {
  const violations = [];
  const canMutateRepository = policies.some((policy) => policy.effectTarget === "repository" && policy.access === "mutation");
  for (const { relative, text } of contractTexts) {
    const carrierAuthorityPlaceholder = /Every relative `?\.roll`? path in this carrier resolves from `context\.authorities` and is never joined to cwd\./iu.test(text);
    const carrierMachineRuntimeBoundary = /Every `~\/\.shared\/roll\/loop\/` path in this carrier is machine-only telemetry and never Workspace authority\./iu.test(text);
    const carrierDiagnosticInitBoundary = /Every `roll init` mention in this carrier is diagnostic example text and never executable Workspace authority\./iu.test(text);
    for (const [offset, line] of text.split(/\r?\n/u).entries()) {
      const location = `${relative}:${offset + 1}`;
      const relativeRollCommand = line.match(/\b(?:git\s+(?:add|-C)|mkdir|find|test\s+-[A-Za-z]+)\b[^\n]*?(?<![\/~])\.roll(?:\/|\b)/iu);
      if (relativeRollCommand !== null && !explicitlyRejects(line, relativeRollCommand.index ?? 0)) {
        violations.push(`relative-roll-command:${location}`);
      }
      const ambientProjectRoot = line.match(/\b(?:works on any|scan the|confirm the current directory is an|reads the local codebase directly)[^\n]*\b(?:project|codebase) root\b/iu);
      if (ambientProjectRoot !== null) violations.push(`ambient-project-root-authority:${location}`);
      const projectRollPlaceholder = line.match(/<project>\/\.roll\//u);
      if (projectRollPlaceholder !== null) violations.push(`project-roll-placeholder-authority:${location}`);
      const ambientMainPush = line.match(/\bgit\s+push\s+origin\s+main\b/iu);
      if (ambientMainPush !== null && !canMutateRepository && !explicitlyRejects(line, ambientMainPush.index ?? 0)) {
        violations.push(`ambient-main-push:${location}`);
      }
      for (const stalePath of line.matchAll(/(?<![A-Za-z0-9_-])\.roll(?:\/[A-Za-z0-9._/-]*)?(?![A-Za-z0-9_-])/gu)) {
        if (stalePath.index === undefined) continue;
        const pathPrefix = line.slice(0, stalePath.index).match(/[^\s"'`()]*$/u)?.[0] ?? "";
        if (pathPrefix.startsWith("/") || pathPrefix.startsWith("~/")) continue;
        if (!legacyBoundary && !carrierAuthorityPlaceholder && !authorityLineIsAllowed(line)) {
          violations.push(`stale-workspace-authority:${location}`);
          break;
        }
      }
      const ambientPwd = line.match(/\$\{ROLL_MAIN_PROJECT:-\$PWD\}|\$PWD|\bpwd\s+-P\b/u);
      if (ambientPwd !== null && !authorityLineIsAllowed(line)) {
        violations.push(`ambient-pwd-authority:${location}`);
      }
      const fixedLoopRuntime = line.match(/~\/\.shared\/roll\/loop\//u);
      if (fixedLoopRuntime !== null && !carrierMachineRuntimeBoundary && !authorityLineIsAllowed(line)) {
        violations.push(`fixed-loop-runtime-authority:${location}`);
      }
      const localRollGit = line.match(/git\s+-C\s+`?\.roll(?:\s|`|$)/iu);
      if (localRollGit !== null && !authorityLineIsAllowed(line)) {
        violations.push(`repository-local-roll-authority:${location}`);
      }
      let unsafePublicInit = false;
      for (const publicInit of line.matchAll(/\broll (?:workspace )?init\b|\bworkspace[ -]init\b/giu)) {
        if (publicInit.index === undefined) continue;
        if (!legacyBoundary && !carrierDiagnosticInitBoundary && !allowedLegacyJournalReference(skillName, line, publicInit.index)) {
          unsafePublicInit = true;
          break;
        }
      }
      if (unsafePublicInit) {
        violations.push(`public-workspace-init:${location}`);
      }
      const globalCurrent = line.match(/global current Workspace/iu);
      if (globalCurrent?.index !== undefined && !explicitlyRejects(line, globalCurrent.index) && !/\b(?:no|not|without)\b/iu.test(line.slice(0, globalCurrent.index))) {
        violations.push(`global-current-workspace:${location}`);
      }
    }
  }
  return violations;
}

function authorityCategories(contractTexts) {
  const categories = new Set();
  for (const { text } of contractTexts) {
    for (const match of text.matchAll(/context\.authorities\.([A-Za-z][A-Za-z0-9_]*)/gu)) {
      categories.add(match[1]);
    }
  }
  return [...categories].sort();
}

function workspaceCreateContractChecks(section) {
  return {
    exactPreviewTuple: /--check[\s\S]*workspaceId[\s\S]*configSha256[\s\S]*planSha256/iu.test(section),
    authorizationDigestMismatchFailsClosed:
      /(?:config|identity|plan)[^\n]*(?:change|changed)[^\n]*(?:fresh preview|discard[^\n]*authorization)/iu.test(section) ||
      /digest[^\n]*changed[\s\S]*discard[^\n]*authorization[\s\S]*new[^\n]*exact preview/iu.test(section),
    naturalLanguageCannotAuthorizeApply:
      /natural-language[^\n]*create_new[^\n]*preview only/iu.test(section) &&
      /(?:broad statements|earlier owner intent)[^\n]*(?:not sufficient|never)/iu.test(section),
    retryPreservesTupleOrRequiresFreshAuthorization:
      /Retry and continuation[^\n]*same create identity[^\n]*preview digests[\s\S]*fresh preview and authorization/iu.test(section),
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function hasExactKeys(value, required, optional = []) {
  const item = record(value);
  if (item === undefined || required.some((key) => !Object.hasOwn(item, key))) return false;
  const allowed = new Set([...required, ...optional]);
  return Object.keys(item).every((key) => allowed.has(key));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function validStringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function validRepositoryBinding(value) {
  if (!hasExactKeys(value, ["schema", "repoId", "alias", "remote", "integrationBranch", "provider", "workflow"])) return false;
  if (
    value.schema !== "roll.repository-binding/v1" ||
    ![value.repoId, value.alias, value.remote, value.integrationBranch, value.provider].every(nonEmptyString)
  ) return false;
  return hasExactKeys(value.workflow, ["branchPattern", "requiredChecks"]) &&
    nonEmptyString(value.workflow.branchPattern) && validStringArray(value.workflow.requiredChecks);
}

function validMatchEvidence(value) {
  if (!hasExactKeys(value, ["kind", "value", "hard", "score", "source", "provenance", "detail"])) return false;
  if (
    !["issue_exact", "requirement_source_exact", "repository_exact", "path_contained", "semantic_supported"].includes(value.kind) ||
    !nonEmptyString(value.value) || typeof value.hard !== "boolean" ||
    typeof value.score !== "number" || !Number.isFinite(value.score) ||
    !nonEmptyString(value.source) || !nonEmptyString(value.detail)
  ) return false;
  const hardProvenance = ["explicit_user", "cli_argument", "issue_manifest", "deterministic_extraction"];
  const nonSemanticProvenance = [...hardProvenance, "cwd_repository"];
  if (["issue_exact", "requirement_source_exact"].includes(value.kind)) {
    return value.hard === true && hardProvenance.includes(value.provenance);
  }
  if (["repository_exact", "path_contained"].includes(value.kind)) {
    return value.hard === false && nonSemanticProvenance.includes(value.provenance);
  }
  return value.hard === false && value.provenance === "semantic_inference";
}

const EXECUTION_AUTHORITY_KEYS = [
  "backlog", "features", "design", "requirements", "policy", "evidence", "toolDumps", "events", "runtime", "locks",
];

function validAuthorities(value) {
  return hasExactKeys(value, EXECUTION_AUTHORITY_KEYS) && EXECUTION_AUTHORITY_KEYS.every((key) => nonEmptyString(value[key]));
}

function validContexts(value) {
  if (!hasExactKeys(value, ["enabled", "bindings"]) || typeof value.enabled !== "boolean" || !Array.isArray(value.bindings)) {
    return false;
  }
  return value.bindings.every((binding) =>
    hasExactKeys(binding, ["providerId", "enabled", "required", "entrypoints"]) &&
    nonEmptyString(binding.providerId) && typeof binding.enabled === "boolean" &&
    typeof binding.required === "boolean" && validStringArray(binding.entrypoints));
}

function validRepositoryExecution(value) {
  if (!hasExactKeys(
    value,
    ["repoId", "alias", "access", "requiredDelivery", "worktreePath", "baseSha", "headSha", "commands"],
    ["noChangePolicy", "dependsOnRepo"],
  )) return false;
  if (
    !nonEmptyString(value.repoId) ||
    !nonEmptyString(value.alias) ||
    !["read", "write"].includes(value.access) ||
    typeof value.requiredDelivery !== "boolean" ||
    ![value.worktreePath, value.baseSha, value.headSha].every(nonEmptyString)
  ) return false;
  if (value.noChangePolicy !== undefined && !["changes_required", "no_change_allowed"].includes(value.noChangePolicy)) return false;
  if (value.dependsOnRepo !== undefined && !nonEmptyString(value.dependsOnRepo)) return false;
  return hasExactKeys(value.commands, ["test", "integration"]) &&
    validStringArray(value.commands.test) && validStringArray(value.commands.integration);
}

function validIssue(value, workspaceId) {
  if (!hasExactKeys(value, ["storyId", "manifestPath", "execution"])) return false;
  if (!nonEmptyString(value.storyId) || !nonEmptyString(value.manifestPath)) return false;
  const execution = value.execution;
  if (!hasExactKeys(execution, ["workspaceId", "issueRoot", "repositories"])) return false;
  if (execution.workspaceId !== workspaceId || !nonEmptyString(execution.issueRoot)) return false;
  const repositories = record(execution.repositories);
  return repositories !== undefined && Object.entries(repositories).every(([repoId, repository]) =>
    validRepositoryExecution(repository) && repository.repoId === repoId);
}

function parseExecutionContext(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : structuredClone(value);
    if (!hasExactKeys(parsed, ["schema", "workspace", "resolution", "bindings", "authorities"], ["contexts", "issue"])) return { ok: false };
    if (parsed.schema !== "roll.workspace-execution-context/v1") return { ok: false };
    if (!hasExactKeys(parsed.workspace, ["workspaceId", "root", "canonicalRoot", "lifecycle"])) return { ok: false };
    if (
      !nonEmptyString(parsed.workspace.workspaceId) ||
      !nonEmptyString(parsed.workspace.root) ||
      !nonEmptyString(parsed.workspace.canonicalRoot) ||
      !["registered", "active", "paused", "archived"].includes(parsed.workspace.lifecycle)
    ) return { ok: false };
    if (!hasExactKeys(parsed.resolution, ["source", "evidence"])) return { ok: false };
    if (
      !["explicit", "environment", "cwd_manifest", "issue_manifest", "requirement_discovery"].includes(parsed.resolution.source) ||
      !Array.isArray(parsed.resolution.evidence) ||
      !parsed.resolution.evidence.every(validMatchEvidence) ||
      (parsed.resolution.source === "requirement_discovery" && parsed.resolution.evidence.length === 0)
    ) return { ok: false };
    if (!Array.isArray(parsed.bindings) || !parsed.bindings.every(validRepositoryBinding)) return { ok: false };
    if (!validAuthorities(parsed.authorities)) return { ok: false };
    if (parsed.contexts !== undefined && !validContexts(parsed.contexts)) return { ok: false };
    if (parsed.issue !== undefined && !validIssue(parsed.issue, parsed.workspace.workspaceId)) return { ok: false };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false };
  }
}

function validateContextPair(input, expectedScope) {
  if (input?.promptContext == null || input?.environmentContext == null) {
    return { decision: "missing_execution_context", proofs: ["missing_context_fail_closed"], failures: ["missing_prompt_or_environment_context"] };
  }
  const prompt = parseExecutionContext(input.promptContext);
  const environment = parseExecutionContext(input.environmentContext);
  if (!prompt.ok || !environment.ok) {
    return { decision: "invalid_workspace_context", proofs: ["context_validation_fail_closed"], failures: ["invalid_prompt_or_environment_context"] };
  }
  if (JSON.stringify(canonicalJson(prompt.value)) !== JSON.stringify(canonicalJson(environment.value))) {
    return { decision: "workspace_context_conflict", proofs: ["prompt_environment_conflict_fail_closed"], failures: ["prompt_environment_context_conflict"] };
  }
  if (
    ["issue_required", "repository_required"].includes(expectedScope) &&
    prompt.value.issue === undefined
  ) {
    return { decision: "workspace_context_scope_mismatch", proofs: ["prompt_env_semantic_identity"], failures: ["context_scope_policy_mismatch"] };
  }
  return { proofs: ["prompt_env_semantic_identity"], failures: [], contextValue: prompt.value };
}

function sameCreateTuple(left, right) {
  return left?.workspaceId === right?.workspaceId &&
    left?.configSha256 === right?.configSha256 &&
    left?.planSha256 === right?.planSha256;
}

function validCreateTupleFields(tuple) {
  return typeof tuple?.workspaceId === "string" && tuple.workspaceId.length > 0 &&
    typeof tuple?.configSha256 === "string" && /^[a-f0-9]{64}$/u.test(tuple.configSha256) &&
    typeof tuple?.planSha256 === "string" && /^[a-f0-9]{64}$/u.test(tuple.planSha256);
}

function validCreateTuple(tuple) {
  return hasExactKeys(tuple, ["workspaceId", "configSha256", "planSha256"]) && validCreateTupleFields(tuple);
}

function validCreateAuthorization(value) {
  return hasExactKeys(value, ["schema", "source", "workspaceId", "configSha256", "planSha256"]) &&
    value.schema === "roll.workspace-create-apply-authorization/v1" && value.source === "owner_after_preview" &&
    validCreateTupleFields(value);
}

export function evaluateWorkspaceHandoffCase(
  skillName,
  caseName,
  input,
  { expectedScope, expectedAuthorityCategories, expectedAccess, repositorySelectorRequired = false } = {},
) {
  const machineCreate = skillName === "roll-ws-create";
  if (!nonEmptyString(skillName)) {
    return { decision: "unknown_skill", proofs: [], failures: ["unknown_skill"] };
  }

  if (machineCreate) {
    const hasPromptContext = input?.promptContext != null;
    const hasEnvironmentContext = input?.environmentContext != null;
    if (hasPromptContext !== hasEnvironmentContext) {
      return { decision: "missing_execution_context", proofs: [], failures: ["partial_optional_context_pair"] };
    }
    if (hasPromptContext && hasEnvironmentContext) {
      const optionalContext = validateContextPair(input);
      if (optionalContext.decision !== undefined) return optionalContext;
    }

    if (caseName === "arbitrary_cwd") {
      if (typeof input?.cwd !== "string" || typeof input?.createConfig !== "string" || input.previewRequested !== true) {
        return { decision: "invalid_create_preview", proofs: [], failures: ["explicit_create_preview_missing"] };
      }
      if (input.rediscoveryAttempted === true) {
        return { decision: "workspace_rediscovery_forbidden", proofs: ["explicit_create_preview"], failures: ["rediscovery_attempted"] };
      }
      return {
        decision: "use_explicit_create_preview",
        proofs: ["explicit_create_preview", "no_rediscovery"],
        failures: [],
      };
    }

    if (caseName === "explicit_selector") {
      if (!validCreateTuple(input?.preview)) {
        return { decision: "invalid_create_preview", proofs: [], failures: ["invalid_preview_tuple"] };
      }
      if (!validCreateTuple(input?.retryPreview)) {
        return { decision: "invalid_create_preview", proofs: ["exact_preview_tuple"], failures: ["invalid_retry_preview_tuple"] };
      }
      if (input.naturalLanguageIntentOnly === true || input.authorization == null) {
        return { decision: "preview_only", proofs: ["exact_preview_tuple", "natural_language_apply_rejected"], failures: ["apply_authorization_missing"] };
      }
      if (!validCreateAuthorization(input.authorization)) {
        return { decision: "invalid_create_authorization", proofs: ["exact_preview_tuple"], failures: ["invalid_authorization_contract"] };
      }
      if (!sameCreateTuple(input.preview, input.authorization) || !sameCreateTuple(input.preview, input.retryPreview)) {
        return { decision: "fresh_preview_required", proofs: ["exact_preview_tuple", "digest_mismatch_fail_closed"], failures: ["preview_authorization_or_retry_tuple_changed"] };
      }
      return {
        decision: "use_explicit_create_identity",
        proofs: ["exact_preview_tuple", "exact_authorization_tuple", "natural_language_apply_rejected", "retry_tuple_continuity"],
        failures: [],
      };
    }

    if (caseName === "requirement_mismatch") {
      if (!WORKSPACE_REQUIREMENT_FAILURE_CODES.has(input?.resolutionCode)) {
        return { decision: "invalid_requirement_failure", proofs: [], failures: ["unknown_requirement_failure"] };
      }
      if (input.rediscoveryAttempted === true) {
        return { decision: "workspace_rediscovery_forbidden", proofs: ["requirement_failure_route"], failures: ["rediscovery_attempted"] };
      }
      if (input.applyAttempted === true) {
        return { decision: "preview_only", proofs: ["requirement_failure_route"], failures: ["clarification_apply_forbidden"] };
      }
      return {
        decision: "stop_and_route_workspace_target",
        proofs: ["requirement_failure_route", "no_rediscovery", "no_apply_from_clarification"],
        failures: [],
      };
    }

    if (caseName === "multi_repo") {
      const bindings = Array.isArray(input?.repositoryBindings) ? [...input.repositoryBindings].sort() : [];
      const validated = Array.isArray(input?.validatedBindings) ? [...input.validatedBindings].sort() : [];
      if (bindings.length === 0 || JSON.stringify(bindings) !== JSON.stringify(validated)) {
        return { decision: "create_binding_validation_failed", proofs: [], failures: ["not_all_create_bindings_validated"] };
      }
      return {
        decision: "validate_all_create_config_bindings",
        proofs: ["all_create_bindings_validated"],
        failures: [],
      };
    }

    if (caseName === "legacy_boundary") {
      if (input?.legacyJournal !== "legacy_create_journal" || input.reconcileOnly !== true || input.legacyCommandExecuted === true) {
        return { decision: "legacy_execution_forbidden", proofs: [], failures: ["legacy_boundary_breached"] };
      }
      return {
        decision: "reconcile_named_legacy_journals_only",
        proofs: ["legacy_journal_read_only", "legacy_command_not_executed"],
        failures: [],
      };
    }
  }

  if (expectedScope === "machine_only") {
    if (input?.workspaceAuthorityUsed === true) {
      return { decision: "workspace_authority_forbidden", proofs: ["machine_only_scope"], failures: ["workspace_authority_forbidden"] };
    }
    if (input?.repositoryAccessAttempted === true) {
      return { decision: "repository_access_forbidden", proofs: ["machine_only_scope"], failures: ["repository_authority_forbidden"] };
    }
    if (caseName === "requirement_mismatch") {
      if (!WORKSPACE_REQUIREMENT_FAILURE_CODES.has(input?.resolutionCode)) {
        return { decision: "invalid_requirement_failure", proofs: ["machine_only_scope"], failures: ["unknown_requirement_failure"] };
      }
      return { decision: "stop_and_route_workspace_target", proofs: ["machine_only_scope", "requirement_failure_route"], failures: [] };
    }
    if (caseName === "multi_repo") {
      return { decision: "repository_access_forbidden", proofs: ["machine_only_scope", "repository_authority_absent"], failures: [] };
    }
    if (caseName === "legacy_boundary") {
      return { decision: "legacy_execution_forbidden", proofs: ["machine_only_scope", "legacy_authority_absent"], failures: [] };
    }
    return { decision: "use_machine_scope", proofs: ["machine_only_scope", "workspace_authority_absent"], failures: [] };
  }

  if (expectedScope === "legacy_migration_only") {
    if (caseName === "requirement_mismatch") {
      if (!WORKSPACE_REQUIREMENT_FAILURE_CODES.has(input?.resolutionCode)) {
        return { decision: "invalid_requirement_failure", proofs: ["legacy_migration_boundary"], failures: ["unknown_requirement_failure"] };
      }
      return { decision: "stop_and_route_workspace_target", proofs: ["legacy_migration_boundary", "requirement_failure_route"], failures: [] };
    }
    if (caseName === "legacy_boundary") {
      if (input?.legacyProjectSelector == null || input?.canonicalNextAction == null || input?.dualWriteAttempted === true) {
        return { decision: "legacy_execution_forbidden", proofs: ["legacy_migration_boundary"], failures: ["legacy_boundary_breached"] };
      }
      return { decision: "legacy_migration_only", proofs: ["legacy_migration_boundary", "canonical_next_action", "no_dual_write"], failures: [] };
    }
    if (input?.legacyProjectSelector == null || input?.legacyProjectSelector === "") {
      return { decision: "stop_without_legacy_project_selector", proofs: ["legacy_migration_boundary"], failures: [] };
    }
    if (caseName === "explicit_selector") {
      return { decision: "use_selected_legacy_project", proofs: ["legacy_migration_boundary", "explicit_legacy_project_selector"], failures: [] };
    }
    return { decision: "stop_without_legacy_project_selector", proofs: ["legacy_migration_boundary", "ambient_cwd_ignored"], failures: [] };
  }

  if (expectedScope === "workspace_optional_read" && input?.promptContext == null && input?.environmentContext == null) {
    if (input?.mutationAttempted === true) {
      return { decision: "workspace_context_scope_mismatch", proofs: ["optional_workspace_context"], failures: ["optional_read_boundary_breached"] };
    }
    if (input?.repositoryAccessAttempted === true) {
      return { decision: "repository_access_forbidden", proofs: ["optional_workspace_context"], failures: ["repository_authority_absent"] };
    }
    if (caseName === "arbitrary_cwd") {
      return { decision: "optional_workspace_context", proofs: ["optional_workspace_context", "ambient_cwd_not_authoritative"], failures: [] };
    }
    if (caseName === "requirement_mismatch") {
      if (!WORKSPACE_REQUIREMENT_FAILURE_CODES.has(input?.resolutionCode)) {
        return { decision: "invalid_requirement_failure", proofs: ["optional_workspace_context"], failures: ["unknown_requirement_failure"] };
      }
      return { decision: "stop_and_route_workspace_target", proofs: ["optional_workspace_context", "requirement_failure_route"], failures: [] };
    }
    if (caseName === "multi_repo") {
      return { decision: "repository_access_forbidden", proofs: ["optional_workspace_context", "repository_authority_absent"], failures: [] };
    }
    if (caseName === "legacy_boundary") {
      return { decision: "legacy_execution_forbidden", proofs: ["optional_workspace_context", "legacy_authority_absent"], failures: [] };
    }
  }

  const context = validateContextPair(input, expectedScope);
  if (context.decision !== undefined) return context;

  if (expectedAccess === "read" && input?.mutationAttempted === true) {
    return { decision: "read_only_operation", proofs: [...context.proofs, "read_only_policy"], failures: ["mutation_forbidden"] };
  }

  if (repositorySelectorRequired && !["multi_repo", "legacy_boundary", "requirement_mismatch"].includes(caseName)) {
    const repositories = context.contextValue.issue?.execution?.repositories;
    if (repositories === undefined) {
      return { decision: "missing_execution_context", proofs: context.proofs, failures: ["repository_execution_map_missing"] };
    }
    if (input?.repositorySelector == null || input.repositorySelector === "") {
      return { decision: "stop_without_repository_selector", proofs: [...context.proofs, "repository_selector_required"], failures: [] };
    }
    const selectedRepositories = Object.values(repositories).filter((repository) =>
      repository.repoId === input.repositorySelector || repository.alias === input.repositorySelector);
    if (selectedRepositories.length === 0) {
      return { decision: "invalid_repository_selector", proofs: context.proofs, failures: ["repository_selector_not_in_context"] };
    }
    if (selectedRepositories.length > 1) {
      return { decision: "ambiguous_repository_selector", proofs: context.proofs, failures: ["repository_selector_ambiguous"] };
    }
    if (expectedAccess === "mutation" && selectedRepositories[0].access !== "write") {
      return { decision: "repository_write_access_required", proofs: context.proofs, failures: ["selected_repository_is_read_only"] };
    }
    context.proofs.push("explicit_repository_selector");
  }

  if (caseName === "arbitrary_cwd") {
    if (input.authoritySource !== "handoff") {
      return { decision: "ambient_authority_forbidden", proofs: context.proofs, failures: ["authority_not_from_handoff"] };
    }
    if (Array.isArray(expectedAuthorityCategories)) {
      const actual = Object.keys(context.contextValue.authorities);
      if (!expectedAuthorityCategories.every((category) => actual.includes(category))) {
        return { decision: "authority_contract_incomplete", proofs: [...context.proofs, "handoff_authority"], failures: ["authority_categories_mismatch"] };
      }
    }
    if (input.rediscoveryAttempted === true) {
      return { decision: "workspace_rediscovery_forbidden", proofs: [...context.proofs, "handoff_authority"], failures: ["rediscovery_attempted"] };
    }
    return {
      decision: "use_handoff_authorities",
      proofs: [...context.proofs, "handoff_authority", "arbitrary_cwd_ignored", "no_rediscovery"],
      failures: [],
    };
  }

  if (caseName === "explicit_selector") {
    const contextWorkspaceId = context.contextValue.workspace.workspaceId;
    const contextStoryId = context.contextValue.issue?.storyId ?? null;
    if (
      input.explicitWorkspaceId !== contextWorkspaceId
    ) {
      return { decision: "workspace_context_conflict", proofs: context.proofs, failures: ["explicit_workspace_mismatch"] };
    }
    if (input.retryWorkspaceId !== contextWorkspaceId || input.retryStoryId !== contextStoryId) {
      return { decision: "retry_identity_conflict", proofs: [...context.proofs, "explicit_workspace_identity"], failures: ["retry_identity_changed"] };
    }
    return {
      decision: "use_verified_explicit_identity",
      proofs: [...context.proofs, "explicit_workspace_identity", "retry_identity_continuity"],
      failures: [],
    };
  }

  if (caseName === "requirement_mismatch") {
    if (!WORKSPACE_REQUIREMENT_FAILURE_CODES.has(input.resolutionCode)) {
      return { decision: "invalid_requirement_failure", proofs: context.proofs, failures: ["unknown_requirement_failure"] };
    }
    if (input.rediscoveryAttempted === true) {
      return { decision: "workspace_rediscovery_forbidden", proofs: [...context.proofs, "requirement_failure_route"], failures: ["rediscovery_attempted"] };
    }
    return {
      decision: "stop_and_route_workspace_target",
      proofs: [...context.proofs, "requirement_failure_route", "no_rediscovery"],
      failures: [],
    };
  }

  if (caseName === "multi_repo") {
    const repositories = context.contextValue.issue?.execution?.repositories;
    if (repositories === undefined) {
      return { decision: "missing_execution_context", proofs: context.proofs, failures: ["repository_execution_map_missing"] };
    }
    const repositoryCount = Object.keys(repositories).length;
    if (repositoryCount < 1) {
      return { decision: "missing_execution_context", proofs: context.proofs, failures: ["repository_execution_map_missing"] };
    }
    if ((repositorySelectorRequired || repositoryCount > 1) && (input.repositorySelector == null || input.repositorySelector === "")) {
      return {
        decision: "stop_without_repository_selector",
        proofs: [...context.proofs, "multi_repo_fail_closed"],
        failures: [],
      };
    }
    const selectedRepositories = input.repositorySelector == null
      ? []
      : Object.values(repositories).filter((repository) =>
        repository.repoId === input.repositorySelector || repository.alias === input.repositorySelector);
    if (input.repositorySelector != null && selectedRepositories.length === 0) {
      return { decision: "invalid_repository_selector", proofs: context.proofs, failures: ["repository_selector_not_in_context"] };
    }
    if (selectedRepositories.length > 1) {
      return { decision: "ambiguous_repository_selector", proofs: context.proofs, failures: ["repository_selector_ambiguous"] };
    }
    if (expectedAccess === "mutation" && selectedRepositories[0]?.access !== "write") {
      return { decision: "repository_write_access_required", proofs: context.proofs, failures: ["selected_repository_is_read_only"] };
    }
    return {
      decision: "use_selected_repository",
      proofs: [...context.proofs, "explicit_repository_selector"],
      failures: [],
    };
  }

  if (caseName === "legacy_boundary") {
    return {
      decision: "legacy_execution_forbidden",
      proofs: [...context.proofs, "legacy_authority_absent"],
      failures: [],
    };
  }

  return { decision: "unknown_case", proofs: context.proofs, failures: ["unknown_case"] };
}

function pairedContext(routes, fixtureName) {
  const fixture = structuredClone(routes.workspaceExecutionContextFixtures?.[fixtureName]);
  return { promptContext: fixture, environmentContext: structuredClone(fixture) };
}

function policyProofCases(policy, routes) {
  if (policy.id === "roll-ws-create") {
    return [
      { case: "arbitrary_cwd", evaluatorCase: "arbitrary_cwd", input: { cwd: "/tmp/us-ws-038", createConfig: "/tmp/workspace-create.yaml", previewRequested: true, rediscoveryAttempted: false }, expected: "use_explicit_create_preview" },
      { case: "authorized_apply", evaluatorCase: "explicit_selector", input: { preview: { workspaceId: "roll", configSha256: "a".repeat(64), planSha256: "b".repeat(64) }, authorization: { schema: "roll.workspace-create-apply-authorization/v1", source: "owner_after_preview", workspaceId: "roll", configSha256: "a".repeat(64), planSha256: "b".repeat(64) }, naturalLanguageIntentOnly: false, retryPreview: { workspaceId: "roll", configSha256: "a".repeat(64), planSha256: "b".repeat(64) } }, expected: "use_explicit_create_identity" },
      { case: "ambiguous_requirement", evaluatorCase: "requirement_mismatch", input: { resolutionCode: "ambiguous_requirement_match", rediscoveryAttempted: false, applyAttempted: false }, expected: "stop_and_route_workspace_target" },
      { case: "all_create_bindings", evaluatorCase: "multi_repo", input: { repositoryBindings: ["product", "skills"], validatedBindings: ["skills", "product"] }, expected: "validate_all_create_config_bindings" },
      { case: "legacy_journal_boundary", evaluatorCase: "legacy_boundary", input: { legacyJournal: "legacy_create_journal", reconcileOnly: true, legacyCommandExecuted: false }, expected: "reconcile_named_legacy_journals_only" },
    ];
  }

  if (policy.scope === "machine_only") {
    return [
      { case: "arbitrary_cwd", evaluatorCase: "arbitrary_cwd", input: { cwd: "/tmp/us-ws-038" }, expected: "use_machine_scope" },
      { case: "workspace_authority_attempt", evaluatorCase: "arbitrary_cwd", input: { workspaceAuthorityUsed: true }, expected: "workspace_authority_forbidden" },
      { case: "repository_authority_attempt", evaluatorCase: "multi_repo", input: { repositoryAccessAttempted: true }, expected: "repository_access_forbidden" },
      { case: "ambiguous_requirement", evaluatorCase: "requirement_mismatch", input: { resolutionCode: "ambiguous_requirement_match" }, expected: "stop_and_route_workspace_target" },
      { case: "legacy_boundary", evaluatorCase: "legacy_boundary", input: {}, expected: "legacy_execution_forbidden" },
    ];
  }

  if (policy.scope === "legacy_migration_only") {
    return [
      { case: "arbitrary_cwd", evaluatorCase: "arbitrary_cwd", input: { cwd: "/tmp/us-ws-038" }, expected: "stop_without_legacy_project_selector" },
      { case: "selected_legacy_project", evaluatorCase: "explicit_selector", input: { legacyProjectSelector: "/tmp/legacy-project" }, expected: "use_selected_legacy_project" },
      { case: "missing_legacy_selector", evaluatorCase: "multi_repo", input: {}, expected: "stop_without_legacy_project_selector" },
      { case: "dual_write_forbidden", evaluatorCase: "legacy_boundary", input: { legacyProjectSelector: "/tmp/legacy-project", canonicalNextAction: "roll workspace create --config plan.yaml --check", dualWriteAttempted: true }, expected: "legacy_execution_forbidden" },
      { case: "canonical_next_action", evaluatorCase: "legacy_boundary", input: { legacyProjectSelector: "/tmp/legacy-project", canonicalNextAction: "roll workspace create --config plan.yaml --check", dualWriteAttempted: false }, expected: "legacy_migration_only" },
    ];
  }

  if (policy.scope === "workspace_optional_read") {
    const context = pairedContext(routes, "workspace");
    return [
      { case: "arbitrary_cwd", evaluatorCase: "arbitrary_cwd", input: { cwd: "/tmp/us-ws-038" }, expected: "optional_workspace_context" },
      { case: "verified_optional_context", evaluatorCase: "explicit_selector", input: { ...context, explicitWorkspaceId: "roll", retryWorkspaceId: "roll", retryStoryId: null }, expected: "use_verified_explicit_identity" },
      { case: "ambiguous_requirement", evaluatorCase: "requirement_mismatch", input: { resolutionCode: "ambiguous_requirement_match" }, expected: "stop_and_route_workspace_target" },
      { case: "mutation_forbidden", evaluatorCase: "arbitrary_cwd", input: { mutationAttempted: true }, expected: "workspace_context_scope_mismatch" },
      { case: "repository_forbidden", evaluatorCase: "multi_repo", input: { repositoryAccessAttempted: true }, expected: "repository_access_forbidden" },
    ];
  }

  const fixtureName = ["issue_required", "repository_required"].includes(policy.scope) ? "issue" : "workspace";
  const base = pairedContext(routes, fixtureName);
  const selected = policy.repositorySelector === "required" ? { repositorySelector: "product" } : {};
  const conflict = pairedContext(routes, fixtureName);
  conflict.environmentContext.workspace.workspaceId = "other";
  if (conflict.environmentContext.issue !== undefined) {
    conflict.environmentContext.issue.execution.workspaceId = "other";
  }
  const cases = [
    { case: "arbitrary_cwd", evaluatorCase: "arbitrary_cwd", input: { ...base, ...selected, cwd: "/tmp/us-ws-038", authoritySource: "handoff", rediscoveryAttempted: false }, expected: "use_handoff_authorities" },
    { case: "missing_context", evaluatorCase: "arbitrary_cwd", input: { promptContext: null, environmentContext: null, ...selected, authoritySource: "handoff" }, expected: "missing_execution_context" },
    { case: "same_story_different_workspace", evaluatorCase: "arbitrary_cwd", input: { ...conflict, ...selected, authoritySource: "handoff" }, expected: "workspace_context_conflict" },
    { case: "ambiguous_requirement", evaluatorCase: "requirement_mismatch", input: { ...base, resolutionCode: "ambiguous_requirement_match", rediscoveryAttempted: false }, expected: "stop_and_route_workspace_target" },
    { case: "legacy_boundary", evaluatorCase: "legacy_boundary", input: base, expected: "legacy_execution_forbidden" },
  ];

  if (policy.repositorySelector === "required") {
    const ambiguous = pairedContext(routes, "issue");
    ambiguous.promptContext.issue.execution.repositories["repo-product-shadow"] = {
      ...structuredClone(ambiguous.promptContext.issue.execution.repositories["repo-product"]),
      repoId: "repo-product-shadow",
    };
    ambiguous.environmentContext = structuredClone(ambiguous.promptContext);
    cases.push(
      { case: "selected_repository", evaluatorCase: "multi_repo", input: { ...base, repositorySelector: "product" }, expected: "use_selected_repository" },
      { case: "missing_repository_selector", evaluatorCase: "multi_repo", input: base, expected: "stop_without_repository_selector" },
      { case: "unknown_repository_selector", evaluatorCase: "multi_repo", input: { ...base, repositorySelector: "unknown" }, expected: "invalid_repository_selector" },
      { case: "ambiguous_repository_selector", evaluatorCase: "multi_repo", input: { ...ambiguous, repositorySelector: "product" }, expected: "ambiguous_repository_selector" },
    );
    if (policy.access === "mutation") {
      cases.push({ case: "read_only_repository", evaluatorCase: "multi_repo", input: { ...base, repositorySelector: "skills" }, expected: "repository_write_access_required" });
    }
  }
  if (policy.access === "read") {
    cases.push({ case: "mutation_forbidden", evaluatorCase: "arbitrary_cwd", input: { ...base, ...selected, authoritySource: "handoff", mutationAttempted: true }, expected: "read_only_operation" });
  }
  return cases;
}

function workspaceHandoffCaseResultsFor(skill, routes) {
  const policies = (routes.workspaceContextPolicies ?? []).filter((policy) => policy.id === skill.name);
  return policies.flatMap((policy) => policyProofCases(policy, routes).map((item) => {
    const evaluation = evaluateWorkspaceHandoffCase(skill.name, item.evaluatorCase, item.input, {
      expectedScope: policy.scope,
      expectedAuthorityCategories: REQUIRED_AUTHORITY_CATEGORIES[skill.name],
      expectedAccess: policy.access,
      repositorySelectorRequired: policy.repositorySelector === "required",
    });
    return {
      operation: policy.operation,
      scope: policy.scope,
      consumer: policy.contextConsumer ?? null,
      effectTarget: policy.effectTarget,
      access: policy.access,
      repositorySelector: policy.repositorySelector,
      case: item.case,
      input: item.input,
      expected: item.expected,
      actual: evaluation.decision,
      proofs: evaluation.proofs,
      failures: evaluation.failures,
      passed: evaluation.decision === item.expected,
    };
  }));
}

export function parseSkillFile(file, contractTexts = collectContractText(path.dirname(file))) {
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
    workspaceHandoffRationale: fields["workspace-handoff-rationale"] ?? "",
    workspaceHandoffSection: extractHandoffSection(body),
    scannedFiles: contractTexts.map(({ relative }) => relative).sort(),
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

function workspaceHandoffViolationsFor(skill, routes, contractTexts, caseResults, authorityCategoryList, createChecks) {
  const violations = [];
  const policies = (routes.workspaceContextPolicies ?? []).filter((policy) => policy.id === skill.name);
  if (policies.length === 0) return violations;
  const policyOperations = policies.map((policy) => policy.operation).sort();
  const policyScopes = [...new Set(policies.map((policy) => policy.scope))];
  const policyConsumers = [...new Set(policies.map((policy) => policy.contextConsumer ?? ""))];
  const ambientPolicies = [...new Set(policies.map((policy) => policy.allowsAmbientCwd))];
  const legacyPolicies = [...new Set(policies.map((policy) => policy.allowsLegacyRollPath))];
  const scopesWithRationale = policies.filter((policy) =>
    policy.scope === "machine_only" || policy.scope === "legacy_migration_only");

  const machineCreate = skill.name === "roll-ws-create";
  const onlyMachine = policyScopes.length === 1 && policyScopes[0] === "machine_only";
  const onlyLegacy = policyScopes.length === 1 && policyScopes[0] === "legacy_migration_only";
  const expectedDeclaration = machineCreate
    ? "machine_create_required"
    : onlyMachine
      ? "machine_only"
      : onlyLegacy
        ? "legacy_migration_only"
        : "required";
  if (skill.workspaceExecutionHandoff !== expectedDeclaration) violations.push("workspace-handoff-declaration-missing");
  const expectedScopeDeclaration = policyScopes.length === 1 ? policyScopes[0] : "policy_driven";
  if (skill.workspaceContextScope !== expectedScopeDeclaration) {
    violations.push("workspace-handoff-policy-mismatch:scope");
  }
  const expectedConsumerDeclaration = policyConsumers.length === 1 ? policyConsumers[0] : "policy_driven";
  if (skill.workspaceContextConsumer !== expectedConsumerDeclaration) {
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
  if (scopesWithRationale.some((policy) => typeof policy.rationale !== "string" || policy.rationale.length === 0)) {
    violations.push("workspace-handoff-policy-rationale-missing");
  }
  if (!machineCreate && scopesWithRationale.length > 0 && skill.workspaceHandoffRationale === "") {
    violations.push("workspace-handoff-rationale-missing");
  }

  for (const policy of policies) {
    if (!["none", "workspace", "issue", "repository", "machine", "legacy_project"].includes(policy.effectTarget)) {
      violations.push(`workspace-handoff-policy-effect-target-invalid:${policy.operation}`);
    }
    if (!["none", "read", "mutation"].includes(policy.access)) {
      violations.push(`workspace-handoff-policy-access-invalid:${policy.operation}`);
    }
    if (!["not_applicable", "required", "forbidden"].includes(policy.repositorySelector)) {
      violations.push(`workspace-handoff-policy-selector-invalid:${policy.operation}`);
    }
    if (policy.contextConsumer === "repository" && policy.repositorySelector !== "required") {
      violations.push(`workspace-handoff-policy-selector-required:${policy.operation}`);
    }
    if (policy.scope === "machine_only" && policy.repositorySelector !== "forbidden") {
      violations.push(`workspace-handoff-policy-selector-forbidden:${policy.operation}`);
    }
    if (!machineCreate && typeof policy.rationale === "string" && policy.rationale.length > 0 && !skill.workspaceHandoffSection.includes(policy.rationale)) {
      violations.push(`workspace-handoff-operation-rationale-missing:${policy.operation}`);
    }
  }

  for (const category of REQUIRED_AUTHORITY_CATEGORIES[skill.name] ?? []) {
    if (!authorityCategoryList.includes(category)) {
      violations.push(`workspace-authority-category-missing:${category}`);
    }
  }

  const section = skill.workspaceHandoffSection;
  if (section === "") {
    violations.push("workspace-handoff-section-missing");
  } else {
    let requiredMarkers = machineCreate
      ? [
          ["machine-create", /machine_only[\s\S]*(?:normal creation|normally absent)[^\n]*(?:no|without)[^\n]*Workspace execution context/iu],
          ["optional-context-pair", /prompt block[\s\S]*ROLL_WORKSPACE_EXECUTION_CONTEXT[\s\S]*(?:both|pair)[\s\S]*semantically identical/iu],
          ["preview", /--check[\s\S]*workspaceId[\s\S]*configSha256[\s\S]*planSha256/iu],
          ["authorization", /roll\.workspace-create-apply-authorization\/v1[\s\S]*unchanged/iu],
          ["create-new-preview", /create_new[^.\n]*preview only/iu],
          ["multi-repo-config", /multiple repositories[^.\n]*validate (?:all|every)[^.\n]*config bindings/iu],
          ["clarify-route", /roll-\.clarify workspace_target/u],
          ["legacy-journal", /(?:read|reconcile)[^.\n]*(?:named|old|historical|legacy)[^.\n]*workspace-init[^.\n]*journal/iu],
        ]
      : onlyMachine
        ? [
          ["machine-only", /machine[_ -]only/iu],
          ["machine-rationale", /rationale/iu],
          ["no-workspace-authority", /no Workspace authority/iu],
          ["repository-forbidden", /repository access is forbidden/iu],
        ]
        : onlyLegacy
          ? [
            ["legacy-selector", /explicitly selected legacy project/iu],
            ["legacy-rationale", /rationale/iu],
            ["canonical-next-action", /canonical next action/iu],
            ["no-dual-write", /no dual-write/iu],
          ]
          : [
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
    if (!policyConsumers.some((consumer) => ["workspace", "issue"].includes(consumer))) {
      requiredMarkers = requiredMarkers.filter(([name]) => name !== "authorities");
    }
    if (!policies.some((policy) => policy.repositorySelector === "required")) {
      requiredMarkers = requiredMarkers.filter(([name]) => !["repositories", "multi-repo-selector"].includes(name));
    }
    for (const [name, pattern] of requiredMarkers) {
      if (!pattern.test(section)) violations.push(`workspace-handoff-marker-missing:${name}`);
    }
    if (machineCreate && /issue\.execution\.repositories|repository (?:ID|id) or alias/iu.test(section)) {
      violations.push("workspace-handoff-machine-create-reuses-issue-contract");
    }
  }

  if (machineCreate) {
    for (const [check, passed] of Object.entries(createChecks)) {
      if (!passed) violations.push(`workspace-create-contract-missing:${check}`);
    }
  }

  const bundles = Array.isArray(routes.workspaceHandoffCases)
    ? routes.workspaceHandoffCases.filter((bundle) => bundle.id === skill.name)
    : [];
  const policyKeys = policies.map((policy) => policy.operation);
  const bundleKeys = bundles.map((bundle) => bundle.operation);
  for (const operation of policyKeys) {
    const matching = bundles.filter((bundle) => bundle.operation === operation);
    if (matching.length === 0) violations.push(`workspace-handoff-cases-missing:${operation}`);
    if (matching.length > 1) violations.push(`workspace-handoff-cases-duplicate:${operation}`);
    const policy = policies.find((candidate) => candidate.operation === operation);
    const expectedProfile = skill.name === "roll-ws-create"
      ? `machine_create:${policy.access}`
      : `${policy.scope}:${policy.access}`;
    if (matching[0]?.proofProfile !== expectedProfile) {
      violations.push(`workspace-handoff-proof-profile-mismatch:${operation}`);
    }
  }
  for (const operation of bundleKeys) {
    if (!policyKeys.includes(operation)) violations.push(`workspace-handoff-cases-orphan:${operation}`);
  }

  for (const result of caseResults) {
    if (result.actual !== result.expected) {
      violations.push(`workspace-handoff-case-decision-invalid:${result.operation}:${result.case}:${result.actual}`);
    }
  }

  violations.push(...staleAuthorityViolations(skill.name, contractTexts, { legacyBoundary: onlyLegacy, policies }));
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
    const skillContractTexts = collectContractText(path.dirname(file));
    const skill = parseSkillFile(file, skillContractTexts);
    const routeContractText = routeCaseContractText(skill.name, routes);
    const contractTexts = [...skillContractTexts, routeContractText];
    const workspaceAuthorityCategories = authorityCategories(contractTexts);
    const createChecks = skill.name === "roll-ws-create"
      ? workspaceCreateContractChecks(skill.workspaceHandoffSection)
      : {};
    const workspaceHandoffCaseResults = workspaceHandoffCaseResultsFor(skill, routes);
    const routeCoverage = routeCoverageFor(skill.name, routes);
    const workspaceHandoffViolations = workspaceHandoffViolationsFor(
      skill,
      routes,
      contractTexts,
      workspaceHandoffCaseResults,
      workspaceAuthorityCategories,
      createChecks,
    );
    return {
      ...skill,
      scannedFiles: [...skill.scannedFiles, "route-cases/skills.json"].sort(),
      workspaceAuthorityCategories,
      workspaceCreateContractChecks: createChecks,
      workspaceHandoffCaseResults,
      routeCoverage: {
        positiveCount: routeCoverage.positive.length,
        negativeCount: routeCoverage.negative.length,
        hasMinimumCoverage: routeCoverage.hasMinimumCoverage,
      },
      workspaceHandoffViolations,
      violations: [...violationsFor(skill, routeCoverage), ...workspaceHandoffViolations],
    };
  });

  const scannedFiles = [...new Set(skills.flatMap((skill) =>
    skill.scannedFiles.map((file) => file === "route-cases/skills.json" ? file : `${skill.name}/${file}`),
  ))].sort();
  const handoffCaseResults = skills.flatMap((skill) => skill.workspaceHandoffCaseResults);
  const registryViolations = [];
  const shippedFamilies = skills.map((skill) => skill.name).sort();
  const policyRows = (routes.workspaceContextPolicies ?? []).filter((policy) => policy.surface === "skill");
  const policyFamilies = [...new Set(policyRows.map((policy) => policy.id))].sort();
  const operationEntries = Array.isArray(routes.skillOperations) ? routes.skillOperations : [];
  const operationFamilies = operationEntries.map((entry) => entry.id).sort();
  const policyKeys = policyRows.map((policy) => `${policy.id}:${policy.operation}`);
  const bundleRows = Array.isArray(routes.workspaceHandoffCases) ? routes.workspaceHandoffCases : [];
  const bundleKeys = bundleRows.map((bundle) => `${bundle.id}:${bundle.operation}`);
  if (JSON.stringify(policyFamilies) !== JSON.stringify(shippedFamilies)) {
    registryViolations.push("workspace-policy-family-inventory-mismatch");
  }
  if (JSON.stringify(operationFamilies) !== JSON.stringify(shippedFamilies)) {
    registryViolations.push("workspace-operation-family-inventory-mismatch");
  }
  if (new Set(policyKeys).size !== policyKeys.length) {
    registryViolations.push("workspace-policy-operation-duplicate");
  }
  if (new Set(bundleKeys).size !== bundleKeys.length) {
    registryViolations.push("workspace-handoff-bundle-duplicate");
  }
  if (JSON.stringify([...policyKeys].sort()) !== JSON.stringify([...bundleKeys].sort())) {
    registryViolations.push("workspace-policy-handoff-bundle-mismatch");
  }
  for (const entry of operationEntries) {
    const operations = [...entry.operations].sort();
    const policyOperations = policyRows.filter((policy) => policy.id === entry.id).map((policy) => policy.operation).sort();
    if (JSON.stringify(operations) !== JSON.stringify(policyOperations)) {
      registryViolations.push(`workspace-operation-policy-mismatch:${entry.id}`);
    }
  }

  const summary = {
    skills: skills.length,
    violations: skills.reduce((count, skill) => count + skill.violations.length, 0) + registryViolations.length,
    over250: skills.filter((skill) => skill.lines > 250).length,
    withGotchas: skills.filter((skill) => skill.hasGotchas).length,
    loadTriggerDescriptions: skills.filter((skill) => skill.descriptionLoadTrigger).length,
    withAuxiliaryFiles: skills.filter((skill) => skill.spokeFiles.length > 0).length,
    workspaceHandoffViolations: skills.reduce(
      (count, skill) => count + skill.workspaceHandoffViolations.length,
      0,
    ),
    workspaceHandoffCases: handoffCaseResults.length,
    workspaceHandoffCaseFailures: handoffCaseResults.filter((result) => !result.passed).length,
    workspaceHandoffRegistryViolations: registryViolations.length,
    scannedFiles: scannedFiles.length,
  };

  return { summary, scannedFiles, skills, workspaceHandoffRegistryViolations: registryViolations };
}

function printHuman(report) {
  console.log(`Skill audit: ${report.summary.skills} skills`);
  console.log(`Load-trigger descriptions: ${report.summary.loadTriggerDescriptions}/${report.summary.skills}`);
  console.log(`Gotchas coverage: ${report.summary.withGotchas}/${report.summary.skills}`);
  console.log(`Skills over 250 lines: ${report.summary.over250}`);
  console.log(`Skills with auxiliary files: ${report.summary.withAuxiliaryFiles}`);
  console.log(`Workspace handoff violations: ${report.summary.workspaceHandoffViolations}`);
  console.log(`Workspace handoff cases: ${report.summary.workspaceHandoffCases - report.summary.workspaceHandoffCaseFailures}/${report.summary.workspaceHandoffCases}`);
  console.log(`Workspace handoff registry violations: ${report.summary.workspaceHandoffRegistryViolations}`);
  console.log(`Scanned files: ${report.summary.scannedFiles}`);
  for (const file of report.scannedFiles) console.log(`  scanned: ${file}`);
  console.log(`Violations: ${report.summary.violations}`);
  for (const violation of report.workspaceHandoffRegistryViolations) console.log(`- registry: ${violation}`);

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
