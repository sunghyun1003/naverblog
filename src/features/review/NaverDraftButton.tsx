import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorUp } from "lucide-react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { getNaverWriter, pairNaverWriter, resolveNaverDraft, revokeNaverWriter, sendNaverDraft, type NaverWriterStatus } from "../../api/client";
import "./naver-writer.css";
import { DEFAULT_NAVER_BLOG_ID, DEFAULT_NAVER_CATEGORY } from "../../../shared/naver-writer-target";

export function NaverDraftButton({ contentId, versionId, disabled }: { contentId: string; versionId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [status, setStatus] = useState<NaverWriterStatus | null>(null);
  const [error, setError] = useState("");
  const [savedReceipt, setSavedReceipt] = useState<string | null>(null);
  const [blogId, setBlogId] = useState(`https://blog.naver.com/${DEFAULT_NAVER_BLOG_ID}`);
  const [categoryName, setCategoryName] = useState<string>(DEFAULT_NAVER_CATEGORY.name);
  const [categoryId, setCategoryId] = useState<string>(DEFAULT_NAVER_CATEGORY.id);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const job = status?.jobs.filter(item => item.blogId === status.blogId).at(-1);

  // No background polling or extra requests on normal page load. Poll only this
  // lightweight status while the user has this dialog open, without overlapping.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const poll = async () => {
      try { setStatus(await getNaverWriter(contentId, controller.signal)); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "PC 상태를 읽지 못했습니다."); }
      finally { if (!controller.signal.aborted) timer = window.setTimeout(poll, 5000); }
    };
    timer = window.setTimeout(poll, 5000);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, contentId]);

  async function act(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "요청에 실패했습니다."); }
    finally { working.current = false; setBusy(false); }
  }

  async function send(resendSavedJobId?: string) {
    if (!status?.blogId) throw new Error("연결된 블로그를 먼저 확인해주세요.");
    const result = await sendNaverDraft(contentId, versionId, { blogId: status.blogId, categoryId: status.category?.id ?? null }, resendSavedJobId);
    setSavedReceipt(result.status === "saved" ? result.id : null);
    setStatus(await getNaverWriter(contentId));
  }
  function begin() {
    setSavedReceipt(null);
    setOpen(true);
    void act(async () => {
      const next = await getNaverWriter(contentId);
      setStatus(next);
      // Opening connection settings must never enqueue work to the old account.
    });
  }

  return <>
    <Button disabled={disabled || busy} icon={<MonitorUp size={17} />} onClick={begin}>네이버 임시저장</Button>
    {createPortal(<Modal open={open} onClose={() => { if (!busy) { setOpen(false); setPairing(null); } }}
      title="Windows PC로 네이버 임시저장"
      description="현재 제목·본문·이미지를 옮깁니다. AI 재작성과 실제 발행은 하지 않습니다.">
      <div className="naver-writer">
        {error ? <p role="alert" className="naver-writer__error">{error}</p> : null}
        {!status ? <p role="status">PC 연결을 확인하고 있습니다.</p> : <>
          {status.blockingJob && status.blockingJob.contentId !== contentId ? <p>
            먼저 확인할 작업: <a href={`/contents/${encodeURIComponent(status.blockingJob.contentId)}`}>{status.blockingJob.title}</a>
          </p> : null}
          {status.connected ? <>
            <p><strong>{status.blogId}</strong> · {status.category ? `요청 카테고리: ${status.category.name} (${status.category.id})` : "카테고리 기본값"} · {status.online ? "PC 도우미 실행 중" : "PC 도우미 꺼짐"}</p>
            {status.helperCompatible === false ? <p role="alert">PC 도우미를 업데이트하고 다시 실행해야 카테고리를 지정할 수 있습니다.</p> : null}
            {status.category ? <small>해당 카테고리의 글쓰기 화면으로 입력합니다. 임시저장 완료는 제목·본문·이미지 검증 결과이며, 최종 카테고리는 직접 발행하기 전에 네이버에서 확인해주세요.</small> : null}
            {!status.online ? <p>바탕화면의 <strong>블로그 임시저장 도우미</strong>를 열고 <strong>실행 시작</strong>을 누르세요. 이 창을 여는 것만으로 도우미가 켜지지는 않습니다. PC가 꺼져 있으면 나중에 자동 실행하지 않습니다.</p> : null}
          </> : null}
            {job ? <section className="naver-writer__status" aria-live="polite">
              <strong>{({ queued: "전송 대기", running: "PC에서 처리 중", needs_check: "네이버에서 확인 필요", saved: "이전 임시저장 완료 기록", cancelled: "전송 취소됨" })[job.status]}</strong>
              <small>{new Date(job.updatedAt).toLocaleString("ko-KR")}</small>
              <p>{job.message}</p>
              {job.status === "needs_check" ? <>
                <p>네이버 임시저장 목록에서 제목·본문·이미지를 확인해주세요. 확인 전에는 중복 전송을 막습니다.</p>
                <div className="naver-writer__actions">
                  <Button disabled={busy} onClick={() => void act(async () => { await resolveNaverDraft(job.id, true); setStatus(await getNaverWriter(contentId)); })}>저장된 것을 확인했어요</Button>
                  <Button disabled={busy} onClick={() => {
                    if (window.confirm("네이버 임시저장 목록에 이 글이 없는 것을 확인하셨나요? 이미 저장되어 있다면 재전송 시 중복 글이 생길 수 있습니다.")) {
                      void act(async () => { await resolveNaverDraft(job.id, false); setStatus(await getNaverWriter(contentId)); });
                    }
                  }}>저장 안 됨 · 다시 보낼 수 있게</Button>
                </div>
              </> : null}
            </section> : null}
          {status.connected ? <>
            {savedReceipt ? <section role="status" className="naver-writer__status">
              <p>동일한 원고를 이미 임시저장한 기록이 있어 새 작업을 시작하지 않았습니다. 네이버 임시저장 목록을 먼저 확인해주세요.</p>
              <Button disabled={busy || !status.online || Boolean(status.blockingJob) || status.helperCompatible === false} onClick={() => {
                if (window.confirm("같은 원고를 새 임시저장본으로 다시 보낼까요? 기존 네이버 글은 수정·삭제하지 않으며 중복 글이 생길 수 있습니다.")) void act(() => send(savedReceipt));
              }}>확인 후 새 임시저장본으로 다시 보내기</Button>
            </section> : null}
            <div className="naver-writer__actions">
              <Button variant="brand" disabled={busy || !status.online || status.helperCompatible === false || Boolean(status.blockingJob)} onClick={() => void act(() => send())}>{busy ? "처리 중…" : "이 블로그로 현재 원고 보내기"}</Button>
              <Button disabled={busy} onClick={() => {
                if (window.confirm("PC 연결을 해제할까요? 이미 네이버에 입력한 글은 삭제하지 않습니다.")) void act(async () => { await revokeNaverWriter(); setStatus(await getNaverWriter(contentId)); });
              }}>PC 연결 해제</Button>
            </div>
          </> : <>
            <p><strong>PC 연결 전</strong>입니다. 아래 연결 코드를 PC 도우미에 등록해야 실행 상태가 표시됩니다. 네이버 비밀번호는 전용 Chrome에 직접 입력하며 서버로 보내지 않습니다.</p>
            <label className="field"><span className="field__label">네이버 블로그 주소 또는 블로그 ID</span>
              <input value={blogId} onChange={e => { setBlogId(e.target.value); setPairing(null); setCategoryId(""); setCategoryName(""); }} placeholder="https://blog.naver.com/블로그ID" autoComplete="off" /></label>
            <label className="field"><span className="field__label">카테고리명 · 기본값 사용 시 비워두기</span>
              <input value={categoryName} onChange={e => { setCategoryName(e.target.value); setPairing(null); }} maxLength={100} autoComplete="off" /></label>
            <label className="field"><span className="field__label">카테고리 번호 · 네이버 카테고리 주소의 categoryNo</span>
              <input value={categoryId} onChange={e => { setCategoryId(e.target.value); setPairing(null); }} inputMode="numeric" maxLength={9} autoComplete="off" /></label>
            <Button disabled={busy || !blogId.trim() || (Boolean(categoryName.trim()) !== Boolean(categoryId.trim())) || (Boolean(categoryId.trim()) && !/^[1-9][0-9]{0,8}$/.test(categoryId.trim()))} onClick={() => void act(async () => setPairing(await pairNaverWriter(blogId, categoryId.trim() ? { id: categoryId.trim(), name: categoryName.trim() } : undefined)))}>PC 연결 코드 만들기</Button>
            {pairing ? <label className="field"><span className="field__label">1회용 연결 코드 · 10분 뒤 만료</span><textarea readOnly value={pairing.code} rows={3} onFocus={e => e.target.select()} /><small>PC의 연결 코드 입력란에만 붙여넣으세요. 채팅이나 GitHub에 올리지 마세요.</small></label> : null}
            <ol><li>바탕화면의 <strong>블로그 임시저장 도우미</strong>를 엽니다. 아이콘이 없으면 이 PC에 도우미 설치가 필요합니다.</li>
              <li>위 연결 코드를 도우미 입력란에 붙여넣고 <strong>PC 연결</strong>을 누릅니다.</li>
              <li><strong>네이버 로그인</strong> → 전용 Chrome에서 직접 로그인 → 도우미의 <strong>로그인 완료</strong>를 누릅니다.</li>
              <li><strong>실행 시작</strong> → 이 팝업이 ‘PC 도우미 실행 중’으로 바뀌면 <strong>이 블로그로 현재 원고 보내기</strong>를 누릅니다.</li></ol>
          </>}
        </>}
        <small>네이버 기본 편집 서식으로 전송합니다. 발행 전 서식을 확인하고 이미지의 AI 활용 체크박스는 네이버에서 직접 설정해주세요. 3줄 요약·FAQ·출처·심의필은 유지됩니다.</small>
      </div>
    </Modal>, document.body)}
  </>;
}
