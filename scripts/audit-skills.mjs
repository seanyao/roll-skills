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
  arbitrary_cwd: "use_handoff_authorities",
  explicit_selector: "use_verified_explicit_identity",
  requirement_mismatch: "stop_and_route_workspace_target",
  multi_repo: "stop_without_repository_selector",
  legacy_boundary: "legacy_migration_only",
};

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

function expectedHandoffOutcome(skillName, taxonomy) {
  if (skillName === "roll-ws-create") {
    return {
      arbitrary_cwd: "use_explicit_create_preview",
      explicit_selector: "use_explicit_create_identity",
      requirement_mismatch: "stop_and_route_workspace_target",
      multi_repo: "validate_all_create_config_bindings",
      legacy_boundary: "reconcile_named_legacy_journals_only",
    }[taxonomy];
  }
  return WORKSPACE_HANDOFF_TAXONOMY[taxonomy];
}

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
      skillOperations: routes.skillOperations?.find((entry) => entry.id === skillName) ?? null,
      workspaceContextPolicies: (routes.workspaceContextPolicies ?? []).filter((policy) => policy.id === skillName),
      workspaceExecutionContextFixtures: routes.workspaceExecutionContextFixtures ?? null,
      workspaceHandoffCases: routes.workspaceHandoffCases?.[skillName] ?? null,
      routes: routes.skills?.[skillName] ?? null,
    }, null, 2),
  };
}

function explicitlyRejects(line, matchIndex) {
  return /(?:forbid(?:s|den)?|never|must not|do not|instead of|rather than)\b[^.;]*$/iu.test(
    line.slice(0, matchIndex),
  );
}

function lastActionBefore(text, targetIndex, actions) {
  const prefix = text.slice(0, targetIndex);
  let last;
  for (const match of prefix.matchAll(actions)) last = match;
  return last;
}

function actionIsExplicitlyNegated(text, action) {
  if (action?.index === undefined) return false;
  return /(?:never|must\s+(?:not|never)|do(?:es)?\s+not|forbid(?:s|den)?)\s*$/iu.test(
    text.slice(0, action.index),
  );
}

function allowedLegacyJournalReference(skillName, clause, initIndex) {
  if (skillName !== "roll-ws-create") return false;
  const action = lastActionBefore(
    clause,
    initIndex,
    /\b(?:read|reconcile|run|running|execute|executing|apply|applying|invoke|invoking|launch|launching|inspect|inspecting|offer|advertise|provide|expose)\b/giu,
  );
  if (action?.index === undefined || !/^(?:read|reconcile)$/iu.test(action[0])) return false;
  return /\b(?:read|reconcile)\b[^.;]*\b(?:named|old|historical|legacy)\b[^.;]*\bworkspace[ -]init\b[^.;]*\bjournal\b/iu.test(
    clause.slice(action.index),
  );
}

function relativeRollAuthorityIsRejected(line, pathIndex) {
  const action = lastActionBefore(
    line,
    pathIndex,
    /\b(?:use|read|write|derive|resolve|load|scan|inspect|edit|treat|discover|rediscover|migrate)\b/giu,
  );
  return actionIsExplicitlyNegated(line, action);
}

function ambientAuthorityIsRejected(line, pathIndex) {
  const action = lastActionBefore(
    line,
    pathIndex,
    /\b(?:use|read|write|derive|resolve|load|scan|inspect|edit|treat|run|execute|invoke|reconcile)\b/giu,
  );
  return actionIsExplicitlyNegated(line, action);
}

function staleAuthorityViolations(skillName, contractTexts) {
  const violations = [];
  for (const { relative, text } of contractTexts) {
    for (const [offset, line] of text.split(/\r?\n/u).entries()) {
      const location = `${relative}:${offset + 1}`;
      for (const stalePath of line.matchAll(/(?<![A-Za-z0-9_-])\.roll(?:\/[A-Za-z0-9._/-]*)?(?![A-Za-z0-9_-])/gu)) {
        if (stalePath.index === undefined) continue;
        const pathPrefix = line.slice(0, stalePath.index).match(/[^\s"'`()]*$/u)?.[0] ?? "";
        if (pathPrefix.startsWith("/") || pathPrefix.startsWith("~/")) continue;
        if (!relativeRollAuthorityIsRejected(line, stalePath.index)) {
          violations.push(`stale-workspace-authority:${location}`);
          break;
        }
      }
      const ambientPwd = line.match(/\$\{ROLL_MAIN_PROJECT:-\$PWD\}|\$PWD|\bpwd\s+-P\b/u);
      if (ambientPwd?.index !== undefined && !ambientAuthorityIsRejected(line, ambientPwd.index)) {
        violations.push(`ambient-pwd-authority:${location}`);
      }
      const fixedLoopRuntime = line.match(/~\/\.shared\/roll\/loop\//u);
      if (fixedLoopRuntime?.index !== undefined && !ambientAuthorityIsRejected(line, fixedLoopRuntime.index)) {
        violations.push(`fixed-loop-runtime-authority:${location}`);
      }
      const localRollGit = line.match(/git\s+-C\s+`?\.roll(?:\s|`|$)/iu);
      if (localRollGit?.index !== undefined && !ambientAuthorityIsRejected(line, localRollGit.index)) {
        violations.push(`repository-local-roll-authority:${location}`);
      }
      let unsafePublicInit = false;
      for (const clause of line.split(/[.;]/u)) {
        for (const publicInit of clause.matchAll(/\broll (?:workspace )?init\b|\bworkspace[ -]init\b/giu)) {
          if (publicInit.index === undefined) continue;
          if (!allowedLegacyJournalReference(skillName, clause, publicInit.index)) {
            unsafePublicInit = true;
            break;
          }
        }
        if (unsafePublicInit) break;
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
  return ["issue_exact", "requirement_source_exact", "repository_exact", "path_contained", "semantic_supported"].includes(value.kind) &&
    nonEmptyString(value.value) && typeof value.hard === "boolean" && typeof value.score === "number" &&
    nonEmptyString(value.source) && [
      "explicit_user", "cli_argument", "issue_manifest", "cwd_repository", "deterministic_extraction", "semantic_inference",
    ].includes(value.provenance) && nonEmptyString(value.detail);
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
      !parsed.resolution.evidence.every(validMatchEvidence)
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
    return { decision: "missing_execution_context", proofs: [], failures: ["missing_prompt_or_environment_context"] };
  }
  const prompt = parseExecutionContext(input.promptContext);
  const environment = parseExecutionContext(input.environmentContext);
  if (!prompt.ok || !environment.ok) {
    return { decision: "invalid_workspace_context", proofs: [], failures: ["invalid_prompt_or_environment_context"] };
  }
  if (JSON.stringify(canonicalJson(prompt.value)) !== JSON.stringify(canonicalJson(environment.value))) {
    return { decision: "workspace_context_conflict", proofs: [], failures: ["prompt_environment_context_conflict"] };
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

function validCreateTuple(tuple) {
  return typeof tuple?.workspaceId === "string" && tuple.workspaceId.length > 0 &&
    typeof tuple?.configSha256 === "string" && /^[a-f0-9]{64}$/u.test(tuple.configSha256) &&
    typeof tuple?.planSha256 === "string" && /^[a-f0-9]{64}$/u.test(tuple.planSha256);
}

function validCreateAuthorization(value) {
  return hasExactKeys(value, ["schema", "source", "workspaceId", "configSha256", "planSha256"]) &&
    value.schema === "roll.workspace-create-apply-authorization/v1" && value.source === "owner_after_preview" &&
    validCreateTuple(value);
}

export function evaluateWorkspaceHandoffCase(
  skillName,
  caseName,
  input,
  { expectedScope, expectedAuthorityCategories } = {},
) {
  const machineCreate = skillName === "roll-ws-create";
  if (!CORE_WORKSPACE_HANDOFF_SKILLS.includes(skillName)) {
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

  const context = validateContextPair(input, expectedScope);
  if (context.decision !== undefined) return context;

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
    if (repositoryCount > 1 && (input.repositorySelector == null || input.repositorySelector === "")) {
      return {
        decision: "stop_without_repository_selector",
        proofs: [...context.proofs, "multi_repo_fail_closed"],
        failures: [],
      };
    }
    if (
      input.repositorySelector != null &&
      !Object.values(repositories).some((repository) =>
        repository.repoId === input.repositorySelector || repository.alias === input.repositorySelector)
    ) {
      return { decision: "invalid_repository_selector", proofs: context.proofs, failures: ["repository_selector_not_in_context"] };
    }
    return {
      decision: "use_selected_repository",
      proofs: [...context.proofs, "explicit_repository_selector"],
      failures: [],
    };
  }

  if (caseName === "legacy_boundary") {
    if (input.scope !== "legacy_migration_only" || input.legacyReadOnly !== true || input.legacyCommandExecuted === true) {
      return { decision: "legacy_execution_forbidden", proofs: context.proofs, failures: ["legacy_boundary_breached"] };
    }
    return {
      decision: "legacy_migration_only",
      proofs: [...context.proofs, "legacy_read_only", "legacy_command_not_executed"],
      failures: [],
    };
  }

  return { decision: "unknown_case", proofs: context.proofs, failures: ["unknown_case"] };
}

function workspaceHandoffCaseResultsFor(skill, routes) {
  if (!CORE_WORKSPACE_HANDOFF_SKILLS.includes(skill.name)) return [];
  const cases = Array.isArray(routes.workspaceHandoffCases?.[skill.name])
    ? routes.workspaceHandoffCases[skill.name]
    : [];
  const policyScopes = [...new Set((routes.workspaceContextPolicies ?? [])
    .filter((policy) => policy.id === skill.name)
    .map((policy) => policy.scope))];
  const expectedScope = policyScopes.length === 1 ? policyScopes[0] : undefined;

  return cases.map((item) => {
    const input = structuredClone(item.input ?? null);
    if (input !== null && typeof input === "object") {
      for (const target of ["promptContext", "environmentContext"]) {
        const fixtureKey = `${target}Fixture`;
        if (input[target] === undefined && typeof input[fixtureKey] === "string") {
          input[target] = structuredClone(routes.workspaceExecutionContextFixtures?.[input[fixtureKey]]);
        }
        delete input[fixtureKey];
      }
    }
    const expected = expectedHandoffOutcome(skill.name, item.case);
    const evaluation = evaluateWorkspaceHandoffCase(skill.name, item.case, input, {
      expectedScope,
      expectedAuthorityCategories: REQUIRED_AUTHORITY_CATEGORIES[skill.name],
    });
    return {
      case: item.case,
      input,
      expected,
      actual: evaluation.decision,
      proofs: evaluation.proofs,
      failures: evaluation.failures,
      passed: item.expected === expected && evaluation.decision === expected && evaluation.failures.length === 0,
    };
  });
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
  if (!CORE_WORKSPACE_HANDOFF_SKILLS.includes(skill.name)) return [];

  const violations = [];
  const policies = (routes.workspaceContextPolicies ?? []).filter((policy) => policy.id === skill.name);
  const policyOperations = policies.map((policy) => policy.operation).sort();
  const policyScopes = [...new Set(policies.map((policy) => policy.scope))];
  const policyConsumers = [...new Set(policies.map((policy) => policy.contextConsumer ?? ""))];
  const ambientPolicies = [...new Set(policies.map((policy) => policy.allowsAmbientCwd))];
  const legacyPolicies = [...new Set(policies.map((policy) => policy.allowsLegacyRollPath))];

  const machineCreate = skill.name === "roll-ws-create";
  const expectedDeclaration = machineCreate ? "machine_create_required" : "required";
  if (skill.workspaceExecutionHandoff !== expectedDeclaration) violations.push("workspace-handoff-declaration-missing");
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

  for (const category of REQUIRED_AUTHORITY_CATEGORIES[skill.name] ?? []) {
    if (!authorityCategoryList.includes(category)) {
      violations.push(`workspace-authority-category-missing:${category}`);
    }
  }

  const section = skill.workspaceHandoffSection;
  if (section === "") {
    violations.push("workspace-handoff-section-missing");
  } else {
    const requiredMarkers = machineCreate
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
      if (item?.expected !== expectedHandoffOutcome(skill.name, taxonomy)) {
        violations.push(`workspace-handoff-case-outcome-invalid:${taxonomy}`);
      }
    }
    for (const taxonomy of Object.keys(WORKSPACE_HANDOFF_TAXONOMY)) {
      if (!seen.has(taxonomy)) violations.push(`workspace-handoff-case-missing:${taxonomy}`);
    }
  }

  for (const result of caseResults) {
    for (const failure of result.failures) {
      violations.push(`workspace-handoff-case-execution-failed:${result.case}:${failure}`);
    }
    if (result.actual !== result.expected) {
      violations.push(`workspace-handoff-case-decision-invalid:${result.case}:${result.actual}`);
    }
  }

  violations.push(...staleAuthorityViolations(skill.name, contractTexts));
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
    workspaceHandoffCases: handoffCaseResults.length,
    workspaceHandoffCaseFailures: handoffCaseResults.filter((result) => !result.passed).length,
    scannedFiles: scannedFiles.length,
  };

  return { summary, scannedFiles, skills };
}

function printHuman(report) {
  console.log(`Skill audit: ${report.summary.skills} skills`);
  console.log(`Load-trigger descriptions: ${report.summary.loadTriggerDescriptions}/${report.summary.skills}`);
  console.log(`Gotchas coverage: ${report.summary.withGotchas}/${report.summary.skills}`);
  console.log(`Skills over 250 lines: ${report.summary.over250}`);
  console.log(`Skills with auxiliary files: ${report.summary.withAuxiliaryFiles}`);
  console.log(`Workspace handoff violations: ${report.summary.workspaceHandoffViolations}`);
  console.log(`Workspace handoff cases: ${report.summary.workspaceHandoffCases - report.summary.workspaceHandoffCaseFailures}/${report.summary.workspaceHandoffCases}`);
  console.log(`Scanned files: ${report.summary.scannedFiles}`);
  for (const file of report.scannedFiles) console.log(`  scanned: ${file}`);
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
