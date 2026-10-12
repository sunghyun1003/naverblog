import assert from "node:assert/strict";
import test from "node:test";
import { approvalNumber, DEFAULT_APPROVAL_NUMBER, COMPLIANCE_IMAGE_PATH, complianceFooterHtml } from "../shared/compliance-footer.js";
import { GitHubAutomationService, type DashboardDraftState } from "../server/services/github-automation.js";

test("과거 원고는 기본 심의필을 사용하고 복사 HTML은 사용자 제공 이미지를 AI 이미지로 오표기하지 않는다", () => {
  for (const value of [undefined, null, "", "\t", {}, "unsafe\nvalue"]) assert.equal(approvalNumber(value), DEFAULT_APPROVAL_NUMBER);
  const custom = DEFAULT_APPROVAL_NUMBER.replace("00000E", "12345E");
  assert.equal(approvalNumber(custom), custom);
  const html = complianceFooterHtml(custom, `https://carrot-blog.web.app${COMPLIANCE_IMAGE_PATH}`);
  assert.ok(html.includes(custom));
  assert.ok(html.indexOf(custom) > html.indexOf("<img"));
  assert.doesNotMatch(html, /AI로 생성/);
  assert.ok(complianceFooterHtml("확인필 & 추가 확인", 'https://example.com/"').includes("확인필 &amp; 추가 확인"));
});

test("GitHub 수동 수정은 심의필을 영구 저장하고 생략한 후속 수정에서도 유지한다", async () => {
  let stored = { schemaVersion: 1, runId: "123", publicationStatus: "none", revision: 1 } as DashboardDraftState;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "fixture" }, (async (_input, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      stored = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
      return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify(stored)).toString("base64"), encoding: "base64", sha: "sha" }), { status: 200 });
  }) as typeof fetch);
  const input = { title: "원고의 변경된 제목", body: "테스트 원고 본문입니다. 안내 문구는 별도의 공통 하단에 표시합니다." };
  const custom = DEFAULT_APPROVAL_NUMBER.replace("00000E", "12345E");
  const first = await service.editDraft("123", { ...input, approvalNumber: custom }, "admin", stored);
  assert.equal(stored.approvalNumber, custom);
  assert.equal(first.manualEdit?.body, input.body);
  const next = await service.editDraft("123", input, "admin", first);
  assert.equal(next.approvalNumber, custom);
  assert.equal(stored.approvalNumber, custom);
});
