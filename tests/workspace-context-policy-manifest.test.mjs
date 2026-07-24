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
  const policies = manifest.workspaceContextPolicies;
  assert.ok(Array.isArray(policies));
  const ids = [...new Set(policies.map((policy) => policy.id))].sort();
  assert.deepEqual(ids, shipped);
  assert.equal(new Set(policies.map((policy) => `${policy.id}:${policy.operation}`)).size, policies.length);
  for (const policy of policies) {
    assert.equal(policy.surface, "skill");
    assert.equal(typeof policy.operation, "string");
    assert.ok(policy.operation.length > 0);
  }
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
});
