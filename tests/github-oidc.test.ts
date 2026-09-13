import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { GitHubSyncIdentity } from "../server/services/github-oidc.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const repository = "sunghyun1003/naverblog-automation";
const audience = "https://carrot-blog.web.app";
const now = () => Math.floor(Date.now() / 1000);
const claims = () => ({ iss: "https://token.actions.githubusercontent.com", aud: audience, repository,
  ref: "refs/heads/main", workflow_ref: `${repository}/.github/workflows/sync-dashboard.yml@refs/heads/main`,
  event_name: "workflow_run", iat: now(), nbf: now() - 5, exp: now() + 300 });
function token(changes = {}, alg = "RS256") {
  const data = [ { alg, kid: "test" }, { ...claims(), ...changes } ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `Bearer ${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}
const identity = () => new GitHubSyncIdentity(audience, repository, (async () => Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256" }] })) as typeof fetch);

test("dedicated main-branch sync identity accepts a valid signature", async () => {
  assert.equal(await identity().verifyAuthorization(token()), true);
});
test("sync rejects wrong repo, workflow, audience, pull requests, expiry and invalid signatures", async () => {
  for (const changes of [{ repository: "evil/fork" }, { workflow_ref: `${repository}/.github/workflows/generate.yml@refs/heads/main` },
    { aud: "wrong" }, { event_name: "pull_request" }, { ref: "refs/heads/other" }, { exp: now() - 1 }, { iat: now() - 1000 }]) {
    assert.equal(await identity().verifyAuthorization(token(changes)), false);
  }
  assert.equal(await identity().verifyAuthorization(token({}, "none")), false);
  assert.equal(await identity().verifyAuthorization(token().slice(0, -12) + "invalid"), false);
  assert.equal(await identity().verifyAuthorization(undefined), false);
});
