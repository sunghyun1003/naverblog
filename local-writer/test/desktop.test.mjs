import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("클릭형 실행기는 연결 코드를 명령행에 넣지 않고 숨긴 자식 프로세스의 입력으로 전달한다", async () => {
  const ui = await readFile(new URL("../desktop.ps1", import.meta.url), "utf8");
  assert.match(ui, /CreateNoWindow = \$true/);
  assert.match(ui, /UseSystemPasswordChar = \$true/);
  assert.match(ui, /StandardInput\.WriteLine\(\$inputValue\)/);
  assert.match(ui, /\$code\.Clear\(\)/);
  assert.doesNotMatch(ui, /Arguments = .*inputValue|\.Kill\(/);
  assert.match(ui, /StandardInput\.WriteLine\('stop'\)/);
  const main = await readFile(new URL("../main.mjs", import.meta.url), "utf8");
  assert.match(main, /process\.env\.WRITER_DESKTOP === "1"/);
  assert.match(main, /desktopInput\.on\("close", stop\)/);
});

test("Windows GUI 스크립트가 콘솔 없이 시작 가능한 형식으로 로드된다", { skip: process.platform !== "win32" }, () => {
  const result = execFileSync("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
    fileURLToPath(new URL("../desktop.ps1", import.meta.url)), "-CheckOnly"], { encoding: "utf8", windowsHide: true });
  assert.match(result, /parsed successfully/);
});
