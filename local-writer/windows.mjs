import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import path from "node:path";

export function writerDirectory() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) throw new Error("이 도우미는 Windows PC용입니다.");
  return path.join(process.env.LOCALAPPDATA, "CarrotBlogWriter");
}
function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8"); child.stdout.on("data", value => { output += value; });
    // Never echo a failure's stderr: it may contain secret input.
    child.on("error", () => reject(new Error("Windows 보안 저장소를 실행하지 못했습니다.")));
    child.on("close", code => code === 0 ? resolve(output.trim()) : reject(new Error("Windows 보안 저장소 처리에 실패했습니다.")));
    child.stdin.end(input);
  });
}
export async function saveDevice(device) {
  const encrypted = await powershell("$ErrorActionPreference='Stop'; $value=[Console]::In.ReadToEnd(); ConvertTo-SecureString $value -AsPlainText -Force | ConvertFrom-SecureString", JSON.stringify(device));
  await mkdir(writerDirectory(), { recursive: true });
  await writeFile(path.join(writerDirectory(), "device.dpapi"), encrypted, { mode: 0o600 });
}
export async function loadDevice() {
  const encrypted = await readFile(path.join(writerDirectory(), "device.dpapi"), "utf8").catch(() => { throw new Error("먼저 npm run writer:pair 로 PC를 연결해주세요."); });
  const plaintext = await powershell("$ErrorActionPreference='Stop'; $value=[Console]::In.ReadToEnd() | ConvertTo-SecureString; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($value); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }", encrypted);
  const device = JSON.parse(plaintext);
  if (!/^[a-f0-9]{64}$/.test(device.token) || !/^[a-zA-Z0-9_-]{2,50}$/.test(device.blogId)) throw new Error("PC 연결을 다시 설정해주세요.");
  return device;
}
export async function acquireLock() {
  await mkdir(writerDirectory(), { recursive: true });
  const file = path.join(writerDirectory(), "writer.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(String(process.pid)); await handle.close();
      return async () => { await unlink(file).catch(() => {}); };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(file, "utf8"));
      if (!Number.isInteger(pid) || pid < 1) throw new Error("PC 도우미 잠금 파일을 확인해주세요.");
      try { process.kill(pid, 0); }
      catch (e) { if (e.code === "ESRCH") { await unlink(file); continue; } }
      throw new Error("PC 도우미 또는 로그인 창이 이미 실행 중입니다. 먼저 기존 창을 종료해주세요.");
    }
  }
  throw new Error("PC 도우미를 시작하지 못했습니다.");
}
