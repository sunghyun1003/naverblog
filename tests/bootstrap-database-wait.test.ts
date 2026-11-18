import assert from "node:assert/strict";
import test from "node:test";
import { waitForDatabase } from "../server/bootstrap.js";

const noSleep = async () => undefined;

test("잠든 DB가 몇 번 시간 초과돼도 깨어나면 서버 시작을 계속한다", async () => {
  let calls = 0;
  const logs: string[] = [];
  await waitForDatabase(async () => {
    calls += 1;
    if (calls < 3) throw new Error("Connection terminated due to connection timeout");
  }, { sleep: noSleep, log: message => logs.push(message) });
  assert.equal(calls, 3);
  assert.equal(logs.length, 2);
});

test("정해진 횟수 안에 연결되지 않으면 마지막 오류로 시작을 중단한다", async () => {
  let calls = 0;
  await assert.rejects(
    waitForDatabase(async () => { calls += 1; throw new Error(`timeout ${calls}`); }, { attempts: 4, sleep: noSleep, log: () => undefined }),
    /timeout 4/,
  );
  assert.equal(calls, 4);
});

test("첫 연결이 성공하면 기다리지 않는다", async () => {
  let slept = false;
  await waitForDatabase(async () => undefined, { sleep: async () => { slept = true; } });
  assert.equal(slept, false);
});
