import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorUp } from "lucide-react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { getNaverWriter, pairNaverWriter, resolveNaverDraft, revokeNaverWriter, sendNaverDraft, type NaverWriterStatus } from "../../api/client";
import "./naver-writer.css";

export function NaverDraftButton({ contentId, versionId, disabled }: { contentId: string; versionId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [status, setStatus] = useState<NaverWriterStatus | null>(null);
  const [error, setError] = useState("");
  const [blogId, setBlogId] = useState("https://blog.naver.com/cest_la_mode");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const job = status?.jobs.at(-1);

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

  async function send() {
    await sendNaverDraft(contentId, versionId);
    setStatus(await getNaverWriter(contentId));
  }
  function begin() {
    setOpen(true);
    void act(async () => {
      const next = await getNaverWriter(contentId);
      setStatus(next);
      if (next.connected && next.online) await send();
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
            <p><strong>{status.blogId}</strong> · 카테고리 기본값 · {status.online ? "PC 도우미 실행 중" : "PC 도우미 꺼짐"}</p>
            {!status.online ? <p>Windows PC에서 <code>npm run writer:start</code>를 실행해주세요. PC가 꺼져 있으면 나중에 자동 실행하지 않습니다.</p> : null}
          </> : null}
            {job ? <section className="naver-writer__status" aria-live="polite">
              <strong>{({ queued: "전송 대기", running: "PC에서 처리 중", needs_check: "네이버에서 확인 필요", saved: "임시저장 확인됨", cancelled: "전송 취소됨" })[job.status]}</strong>
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
            <div className="naver-writer__actions">
              <Button variant="brand" disabled={busy || !status.online || job?.status === "running" || job?.status === "queued" || job?.status === "needs_check"} onClick={() => void act(send)}>{busy ? "처리 중…" : "현재 원고 보내기"}</Button>
              <Button disabled={busy} onClick={() => {
                if (window.confirm("PC 연결을 해제할까요? 이미 네이버에 입력한 글은 삭제하지 않습니다.")) void act(async () => { await revokeNaverWriter(); setStatus(await getNaverWriter(contentId)); });
              }}>PC 연결 해제</Button>
            </div>
          </> : <>
            <p>처음 한 번만 PC 도우미와 블로그를 연결합니다. 네이버 비밀번호는 도우미 브라우저에 직접 입력하며 서버로 보내지 않습니다.</p>
            <label className="field"><span className="field__label">네이버 블로그 주소 또는 블로그 ID</span>
              <input value={blogId} onChange={e => setBlogId(e.target.value)} placeholder="https://blog.naver.com/블로그ID" autoComplete="off" /></label>
            <Button disabled={busy || !blogId.trim()} onClick={() => void act(async () => setPairing(await pairNaverWriter(blogId)))}>PC 연결 코드 만들기</Button>
            {pairing ? <label className="field"><span className="field__label">1회용 연결 코드 · 10분 뒤 만료</span><textarea readOnly value={pairing.code} rows={3} onFocus={e => e.target.select()} /><small>PC의 연결 코드 입력란에만 붙여넣으세요. 채팅이나 GitHub에 올리지 마세요.</small></label> : null}
            <ol><li>프로젝트 폴더의 PowerShell에서 <code>npm run writer:setup</code></li>
              <li><code>npm run writer:pair</code> 실행 → 위 연결 코드 입력</li>
              <li><code>npm run writer:login</code> 실행 → 네이버 직접 로그인</li>
              <li><code>npm run writer:start</code> 실행 → 이 화면에서 원고 보내기</li></ol>
          </>}
        </>}
        <small>첫 버전은 네이버의 기본 편집 서식을 사용합니다. 편집기가 지원하지 않는 서식은 확인이 필요하며, 3줄 요약·FAQ·출처와 이미지 위치는 전송 자료에 보존됩니다.</small>
      </div>
    </Modal>, document.body)}
  </>;
}
