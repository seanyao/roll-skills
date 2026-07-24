import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "route-cases", "skills.json"), "utf8"));
const shipped = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();

test("every shipped skill family has operation-level Workspace context policy", () => {
  const declarations = manifest.skillOperations;
  const policies = manifest.workspaceContextPolicies;
  assert.ok(Array.isArray(declarations));
  assert.ok(Array.isArray(policies));
  assert.deepEqual(declarations.map((entry) => entry.id).sort(), shipped);
  const ids = [...new Set(policies.map((policy) => policy.id))].sort();
  assert.deepEqual(ids, shipped);
  assert.equal(new Set(policies.map((policy) => `${policy.id}:${policy.operation}`)).size, policies.length);
  for (const policy of policies) {
    assert.equal(policy.surface, "skill");
    assert.equal(typeof policy.operation, "string");
    assert.ok(policy.operation.length > 0);
  }
});

test("independent skill operation declarations cannot be satisfied by policy self-inventory", () => {
  const inventory = manifest.skillOperations.flatMap((entry) =>
    entry.operations.map((operation) => `${entry.id}:${operation}`));
  const policies = new Set(manifest.workspaceContextPolicies.map((policy) => `${policy.id}:${policy.operation}`));
  assert.deepEqual(inventory.filter((operation) => !policies.has(operation)), []);

  const future = `${manifest.skillOperations[0].id}:future-operation`;
  const futureInventory = [...inventory, future];
  assert.deepEqual(futureInventory.filter((operation) => !policies.has(operation)), [future]);
});

test("mixed create and clarify skills expose independent operations", () => {
  const policies = manifest.workspaceContextPolicies;
  assert.deepEqual(
    policies.filter((policy) => policy.id === "roll-ws-create").map((policy) => policy.operation).sort(),
    ["apply", "preview"],
  );
  assert.deepEqual(
    policies.filter((policy) => policy.id === "roll-.clarify").map((policy) => policy.operation).sort(),
    ["scope", "workspace_target"],
  );
  assert.deepEqual(
    policies.find((policy) => policy.id === "roll-.clarify" && policy.operation === "workspace_target"),
    {
      surface: "skill",
      id: "roll-.clarify",
      operation: "workspace_target",
      scope: "workspace_optional_read",
      contextConsumer: "workspace",
      allowsAmbientCwd: false,
      allowsLegacyRollPath: false,
    },
  );
});
