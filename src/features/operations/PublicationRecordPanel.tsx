import { useEffect, useId, useRef, useState } from "react";
import { getPublicationRecord, savePublicationRecord } from "../../api/client";
import { Button } from "../../components/Button";
import { isNaverBlogUrl, type PublicationRecordDocument, type PublicationRecordInput } from "../../../shared/publication-record";

export function PublicationRecordPanel({ contentId }: { contentId: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<PublicationRecordDocument | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const pending = useRef<{ id: string; input: PublicationRecordInput } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function load() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    try {
      const next = await getPublicationRecord(contentId, request.signal);
      if (request.signal.aborted) return;
      // Keep edits on conflict/reload, but refresh an untouched URL from the server.
      if (!record || url === (record.externalUrl ?? "")) setUrl(next.externalUrl ?? "");
      setRecord(next);
      setMessage(record ? "최신 기록을 불러왔습니다. 작성 중인 메모는 유지됩니다." : "");
    } catch (error) {
      if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : "발행 기록을 불러오지 못했습니다.");
    } finally {
      locked.current = false;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  async function save() {
    if (!record || locked.current) return;
    const input = { externalUrl: url.trim(), note: note.trim() };
    if (input.externalUrl && !isNaverBlogUrl(input.externalUrl)) {
      setMessage("네이버 블로그 게시 URL을 확인해주세요.");
      return;
    }
    const previous = pending.current;
    const attempt = previous && previous.input.externalUrl === input.externalUrl && previous.input.note === input.note
      ? previous : { id: crypto.randomUUID(), input };
    pending.current = attempt;
    locked.current = true;
    setBusy(true);
    try {
      const next = await savePublicationRecord(contentId, attempt.id, record.revision, input);
      setRecord(next);
      setUrl(next.externalUrl ?? "");
      setNote("");
      pending.current = null;
      setMessage("발행 기록을 저장했습니다. 대시보드 원고와 네이버 게시글은 변경하지 않았습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다. 입력 내용은 유지됩니다.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const changed = record && (url.trim() !== (record.externalUrl ?? "") || note.trim());
  return <div className="publication-record">
    <Button aria-expanded={open} aria-controls={panelId} disabled={busy} onClick={() => {
      setOpen(value => !value);
      if (!open && !record) void load();
    }}>{open ? "발행 기록 닫기" : "게시 URL · 수정 메모"}</Button>
    <div id={panelId} hidden={!open} aria-busy={busy}>
      <p className="publication-record-help">실제 게시 URL과 네이버에서 수정한 내용을 기록합니다. 원고 수정·재생성·자동 발행은 실행하지 않습니다. 준법심의 학습용 의견은 원고의 ‘준법심의 피드백’에 남겨주세요.</p>
      <Button onClick={() => void load()} disabled={busy}>기록 새로고침</Button>
      {busy ? <p role="status">발행 기록 처리 중...</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {record ? <>
        {record.externalUrl ? <a className="published-link" href={record.externalUrl} target="_blank" rel="noopener noreferrer">네이버 게시글 보기 ↗</a> : <p className="publication-record-help">등록된 게시 URL이 없습니다.</p>}
        <div className="publication-record-fields">
          <div><label htmlFor={`${panelId}-url`}>게시 URL (선택)</label><input id={`${panelId}-url`} type="url" maxLength={2048} value={url} disabled={busy} placeholder="https://blog.naver.com/..." onChange={event => setUrl(event.target.value)} /></div>
          <div><label htmlFor={`${panelId}-note`}>게시 후 수정 메모 (선택)</label><textarea id={`${panelId}-note`} rows={3} maxLength={2000} value={note} disabled={busy} placeholder="예: 네이버 게시글의 첫 문단 표현을 심의 의견에 맞게 수정" onChange={event => setNote(event.target.value)} /></div>
          <Button variant="brand" onClick={() => void save()} disabled={busy || !changed}>발행 기록 저장</Button>
        </div>
        {record.entries.length ? <ol className="publication-record-history" aria-label="발행 기록 이력">{[...record.entries].reverse().map(entry => <li key={entry.id}>
          <time dateTime={entry.recordedAt}>{new Date(entry.recordedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)</time>
          {entry.note ? <p>{entry.note}</p> : <p>게시 URL 변경</p>}
          {entry.externalUrl ? <a href={entry.externalUrl} target="_blank" rel="noopener noreferrer">{entry.externalUrl}</a> : <span>게시 URL 미등록</span>}
        </li>)}</ol> : null}
      </> : null}
    </div>
  </div>;
}
