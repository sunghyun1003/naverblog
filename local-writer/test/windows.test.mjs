import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkDeviceStorage, saveDevice, loadDevice } from "../windows.mjs";

test("다른 PowerShell 모듈 경로를 상속해도 Windows 보안 저장소와 한국어가 왕복 보존된다", { skip: process.platform !== "win32" }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "writer-storage-test-"));
  const original = process.env.LOCALAPPDATA;
  const modules = process.env.PSModulePath;
  process.env.LOCALAPPDATA = temporary;
  process.env.PSModulePath = path.join(temporary, "wrong-modules");
  try {
    await checkDeviceStorage();
    const device = { token: "a".repeat(64), blogId: "test_blog", profileVersion: 2, category: { id: "63", name: "자동차보험" } };
    await saveDevice(device);
    const ciphertext = await readFile(path.join(temporary, "CarrotBlogWriter", "device.dpapi"), "utf8");
    assert.ok(!ciphertext.includes(device.token));
    assert.ok(!ciphertext.includes(device.blogId));
    assert.deepEqual(await loadDevice(), device);
  } finally {
    if (original === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = original;
    if (modules === undefined) delete process.env.PSModulePath; else process.env.PSModulePath = modules;
    await rm(temporary, { recursive: true, force: true });
  }
});
