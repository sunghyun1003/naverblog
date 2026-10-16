import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cachedContents, cancelContentSchedule, listContents, markContentPublished, scheduleContent } from "../../api/client";
import type { ApiContent, ApiFreshness } from "../../api/types";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { mapContent } from "../../api/mapping";

const visible = (content: ApiContent) => ["review_ready", "approved", "scheduled", "published", "measured"].includes(content.state);
const scheduleInput = (value: string | null) => value
  ? new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T").slice(0, 16) : "";
type Action = "schedule" | "cancel" | "publish";

export function SchedulePage() {
  const cached = cachedContents();
  const [contents, setContents] = useState<ApiContent[]>(cached?.items.filter(visible) ?? []);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(!cached);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(cached?.freshness ?? null);
  const [actionBusy, setActionBusy] = useState<{ contentId: string; action: Action } | null>(null);
  const actionLockRef = useRef(false);

  const refresh = async (signal?: AbortSignal, force = false) => {
    setLoading(true);
    try {
      const response = await listContents(signal, force);
      if (signal?.aborted) return;
      setContents(response.items.filter(visible));
      setFreshness(response.freshness ?? null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "발행 일정을 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, []);

  const act = async (content: ApiContent, action: Action) => {
    if (loading || actionLockRef.current) return;
    const value = dates[content.id] ?? scheduleInput(content.scheduledAt);
    if (action === "schedule" && (!value || !Number.isFinite(Date.parse(value + ":00+09:00")))) return;
    if (action === "publish" && !window.confirm("네이버 블로그에 직접 게시한 원고인가요? 이 버튼은 발행 완료 기록만 저장하며 실제 게시하지 않습니다.")) return;
    actionLockRef.current = true;
    setActionBusy({ contentId: content.id, action });
    try {
      const result = action === "cancel" ? await cancelContentSchedule(content.id)
        : action === "publish" ? await markContentPublished(content.id, urls[content.id]?.trim() ?? "")
          : await scheduleContent(content.id, new Date(value + ":00+09:00").toISOString());
      // Use the mutation response so a delayed mirror cannot restore the old reservation.
      setContents(current => current.map(item => item.id === content.id ? result.content : item).filter(visible));
      if (action === "cancel") setDates(current => ({ ...current, [content.id]: "" }));
      const success = action === "cancel" ? "예약을 해제했습니다. 원고와 이미지는 그대로 보존됩니다."
        : action === "publish" ? "수동 발행 완료를 기록했습니다." : "발행 예정 시간을 저장했습니다. 자동 발행·알림은 실행되지 않습니다.";
      setMessage(success + (result.mirrorSynced === false ? " 운영 DB 반영은 지연되고 있습니다." : ""));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "발행 기록 변경에 실패했습니다.");
    } finally {
      actionLockRef.current = false;
      setActionBusy(null);
    }
  };

  const busy = loading || actionBusy !== null;
  const ordered = [...contents].sort((a, b) => Number(b.state === "scheduled") - Number(a.state === "scheduled"));
  return (
    <div className="operations-page" aria-busy={busy}>
      <header className="operations-heading"><Button icon={<RefreshCw size={17} />} onClick={() => void refresh(undefined, true).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "발행 일정을 불러오지 못했습니다."))} disabled={busy}>새로고침</Button></header>
      <div className="operations-notice" role="note">일정은 <strong>발행 예정 메모</strong>입니다. 자동 발행과 알림 발송은 하지 않습니다. 네이버에 직접 게시한 뒤 <strong>수동 발행 완료</strong>로 기록하세요. 예약과 게시 URL 입력은 필수가 아닙니다.</div>
      {message ? <div className="operations-notice" role="status">{message}</div> : null}
      {freshness?.stale ? <div className="operations-notice" role="alert">최신 조회가 지연되어 마지막 저장 내용을 표시합니다. 변경 전 새로고침해주세요.</div> : null}
      <section className="schedule-list" aria-label="발행 관리 목록">
        {loading && !contents.length ? <div className="operations-empty schedule-loading-state" role="status">발행 일정을 불러오는 중입니다.</div> : ordered.map(content => {
          const editable = ["review_ready", "approved", "scheduled"].includes(content.state);
          const date = dates[content.id] ?? scheduleInput(content.scheduledAt);
          return (
            <article key={content.id}>
              <header><h2><Link to={"/contents/" + content.id}>{content.title}</Link></h2><StatusBadge status={mapContent(content).status} /></header>
              {content.state === "scheduled" ? <p className="schedule-date">현재 발행 예정: {scheduleInput(content.scheduledAt).replace("T", " ") || "날짜 미지정"} (한국 시간)</p> : null}
              {editable ? <>
                <div className="schedule-control">
                  <label><span>발행 예정 (한국 시간)</span><input type="datetime-local" value={date} disabled={busy} onChange={event => setDates(current => ({ ...current, [content.id]: event.target.value }))} /></label>
                  <Button onClick={() => void act(content, "schedule")} disabled={busy || !date}>{actionBusy?.contentId === content.id && actionBusy.action === "schedule" ? "저장 중..." : content.state === "scheduled" ? "일정 변경" : "일정 저장"}</Button>
                  {content.state === "scheduled" ? <Button onClick={() => void act(content, "cancel")} disabled={busy}>{actionBusy?.contentId === content.id && actionBusy.action === "cancel" ? "해제 중..." : "예약 해제"}</Button> : null}
                </div>
                <div className="schedule-control">
                  <label><span>네이버 게시 URL (선택)</span><input type="url" placeholder="https://blog.naver.com/..." value={urls[content.id] ?? ""} disabled={busy} onChange={event => setUrls(current => ({ ...current, [content.id]: event.target.value }))} /></label>
                  <Button variant="brand" icon={<CheckCircle2 size={17} />} onClick={() => void act(content, "publish")} disabled={busy}>{actionBusy?.contentId === content.id && actionBusy.action === "publish" ? "처리 중..." : "수동 발행 완료"}</Button>
                </div>
              </> : null}
              {(content.state === "published" || content.state === "measured") && content.publishedAt ? <p className="published-link">발행 기록 {new Date(content.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)</p> : null}
            </article>
          );
        })}
        {!loading && !contents.length ? <div className="operations-empty">완성되거나 발행 예정인 원고가 없습니다.</div> : null}
      </section>
    </div>
  );
}
