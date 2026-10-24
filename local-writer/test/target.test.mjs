import assert from "node:assert/strict";
import test from "node:test";
import { validateTarget, writeUrl, editorBlogId, profileParts, sameTarget, categoryListUrl, assertCategoryLink } from "../target.mjs";

const target = { blogId: "hanwhains_carrot", category: { id: "63", name: "자동차보험" }, profileVersion: 2 };

test("새 계정의 카테고리 글쓰기 주소와 중립적인 재열기 주소를 분리한다", () => {
  assert.equal(writeUrl(target), "https://blog.naver.com/hanwhains_carrot/postwrite?categoryNo=63");
  assert.equal(writeUrl(target, false), "https://blog.naver.com/PostWriteForm.naver?blogId=hanwhains_carrot");
  assert.equal(writeUrl({ blogId: "legacy_blog" }), "https://blog.naver.com/PostWriteForm.naver?blogId=legacy_blog");
});

test("현행·기존 편집기를 모두 감지하되 다른 블로그나 도메인을 혼동하지 않는다", () => {
  assert.equal(editorBlogId(writeUrl(target)), target.blogId);
  assert.equal(editorBlogId(writeUrl(target, false)), target.blogId);
  assert.notEqual(editorBlogId("https://blog.naver.com/other_blog/postwrite"), target.blogId);
  for (const value of ["https://blog.naver.com.evil.example/hanwhains_carrot/postwrite", "http://blog.naver.com/hanwhains_carrot/postwrite", "https://blog.naver.com/PostList.naver?blogId=hanwhains_carrot", "about:blank"]) assert.equal(editorBlogId(value), null);
});

test("새 연결은 블로그별 새 로그인 저장소를 사용하고 이전 프로필은 그대로 남긴다", () => {
  assert.deepEqual(profileParts(target), ["naver-profiles", "hanwhains_carrot"]);
  assert.deepEqual(profileParts({ blogId: "legacy_blog" }), ["naver-profile"]);
  assert.throws(() => profileParts({ ...target, blogId: "../legacy" }), /블로그/);
  assert.throws(() => profileParts({ ...target, profileVersion: 3 }), /연결/);
});

test("블로그·카테고리 하나라도 바뀐 작업은 이전 PC 연결로 처리하지 않는다", () => {
  assert.equal(sameTarget(target, { ...target }), true);
  assert.equal(sameTarget(target, { ...target, blogId: "other_blog" }), false);
  assert.equal(sameTarget(target, { ...target, category: { id: "64", name: "운전자보험" } }), false);
  assert.equal(sameTarget(target, { blogId: target.blogId }), false);
  assert.equal(sameTarget({ blogId: "legacy_blog" }, { blogId: "legacy_blog" }), true);
});

test("URL·카테고리 입력은 경로 탈출 및 잘못된 값을 허용하지 않는다", () => {
  for (const blogId of ["../x", "https://evil.example", "x?blogId=y", ["valid"], 123]) assert.throws(() => validateTarget({ blogId }), /블로그/);
  for (const id of ["0", "-1", "63&evil=1", "1.5", 63]) assert.throws(() => validateTarget({ ...target, category: { id, name: "자동차보험" } }), /카테고리/);
  assert.throws(() => validateTarget({ ...target, category: { id: "63", name: " \n " } }), /카테고리/);
});

test("네이버에 표시된 카테고리 번호·이름·블로그를 입력 전에 대조한다", () => {
  assert.doesNotThrow(() => assertCategoryLink(target, "자동차보험", categoryListUrl(target)));
  assert.doesNotThrow(() => assertCategoryLink(target, "자동차보험", "/PostList.naver?blogId=hanwhains_carrot&from=postList&categoryNo=63"));
  assert.throws(() => assertCategoryLink(target, "운전자보험", categoryListUrl(target)), /카테고리/);
  assert.throws(() => assertCategoryLink(target, "자동차보험", categoryListUrl(target).replace("63", "64")), /카테고리/);
  assert.throws(() => assertCategoryLink(target, "자동차보험", categoryListUrl(target).replace("hanwhains_carrot", "other_blog")), /카테고리/);
  assert.throws(() => assertCategoryLink(target, "자동차보험", "https://evil.example"), /카테고리/);
});
