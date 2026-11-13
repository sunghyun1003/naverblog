import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { desktopCommands } from "../desktop-input.mjs";

test("confirmation survives browser navigation; stop survives the login-to-worker transition", async () => {
  const input = new PassThrough(); let stopped = 0;
  const commands = desktopCommands(input, () => stopped++);
  input.write("\n");
  assert.equal(await commands.next(), "");
  input.write("stop\n");
  assert.equal(stopped, 1);
  assert.equal(await commands.next(), "stop");
  commands.close();
  assert.equal(stopped, 1);
});
test("closing the helper resolves a waiting login confirmation safely", async () => {
  const input = new PassThrough(); let stopped = false;
  const commands = desktopCommands(input, () => { stopped = true; });
  const waiting = commands.next();
  input.end();
  assert.equal(await waiting, "stop");
  assert.equal(stopped, true);
});
