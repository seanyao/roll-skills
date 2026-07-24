import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const skill = readFileSync(resolve("roll-ws-create/SKILL.md"), "utf8");
const defaultPrompt = readFileSync(resolve("roll-ws-create/agents/openai.yaml"), "utf8");

assert.match(skill, /--check --json/u, "skill must preview through the canonical read-only command");
assert.match(skill, /configSha256/u, "skill must surface the exact config digest");
assert.match(skill, /planSha256/u, "skill must surface the exact plan digest");
assert.match(skill, /roll\.workspace-create-apply-authorization\/v1/u, "skill must write the closed authorization schema");
assert.match(skill, /"source": "owner_after_preview"/u, "skill must bind apply to explicit owner approval");
assert.match(skill, /--authorization \/absolute\/path\/workspace-create-authorization\.json/u, "skill apply must carry the authorization file");
assert.match(skill, /create_new[^.]+preview only/isu, "clarify create_new must remain preview-only");
assert.doesNotMatch(
  skill,
  /roll workspace create ws-demo --config \/absolute\/path\/workspace-create\.yaml --json\s*$/mu,
  "skill must not advertise an unbound agent apply command",
);
assert.match(
  defaultPrompt,
  /workspaceId \+ configSha256 \+ planSha256/u,
  "default prompt must bind apply to the exact preview tuple",
);

console.log("roll-ws-create authorization contract passed");
