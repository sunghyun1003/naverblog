import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { listContents, markContentPublished, scheduleContent } from "../../api/client";
import type { ApiContent, ApiFreshness } from "../../api/types";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { mapContent } from "../../api/mapping";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";

export function SchedulePage() {
  const cached = readRuntimeCache<{ items: ApiContent[]; freshness?: ApiFreshness }>("schedule:contents");
  const [contents, setContents] = useState<ApiContent[]>(cached?.items ?? []);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(!cached);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(cached?.freshness ?? null);
  const [actionBusy, setActionBusy] = useState<{ contentId: string; action: "schedule" | "publish" } | null>(null);
  const actionLockRef = useRef(false);

  const refresh = async (signal?: AbortSignal, force = false) => {
    setLoading(contents.length === 0);
    try {
      const response = await listContents(signal, force);
      const nextItems = response.items.filter((content) => ["approved", "scheduled", "published"].includes(content.state));
      const nextFreshness = response.freshness ?? null;
      setContents(nextItems);
      setFreshness(nextFreshness);
      writeRuntimeCache("schedule:contents", { items: nextItems, freshness: nextFreshness ?? undefined });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "발행 일정을 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, []);

  const schedule = async (content: ApiContent) => {
    const value = dates[content.id];
    if (!value || loading || actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy({ contentId: content.id, action: "schedule" });
    try {
      const result = await scheduleContent(content.id, new Date(value).toISOString());
      setMessage(result.mirrorSynced === false
        ? "예약은 저장됐지만 운영 DB 동기화가 지연되고 있습니다. 잠시 후 새로고침해주세요."
        : "발행 예정 시간을 저장했습니다.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "발행 일정 저장에 실패했습니다.");
    } finally {
      actionLockRef.current = false;
      setActionBusy(null);
    }
  };

  const published = async (content: ApiContent) => {
    const value = urls[content.id]?.trim();
    if (!value || loading || actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy({ contentId: content.id, action: "publish" });
    try {
      const result = await markContentPublished(content.id, value);
      setMessage(result.mirrorSynced === false
        ? "발행 기록은 저장됐지만 운영 DB 동기화가 지연되고 있습니다. 잠시 후 새로고침해주세요."
        : "네이버 발행 URL을 저장했습니다.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "발행 URL 저장에 실패했습니다.");
    } finally {
      actionLockRef.current = false;
      setActionBusy(null);
    }
  };

  return (
    <div className="operations-page" aria-busy={loading || actionBusy !== null}>
      <header className="operations-heading"><Button icon={<RefreshCw size={17} />} onClick={() => void refresh(undefined, true).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "발행 일정을 불러오지 못했습니다."))} disabled={loading || actionBusy !== null}>새로고침</Button></header>
      {message ? <div className="operations-notice" role="status">{message}</div> : null}
      {freshness?.stale ? (
        <div className="operations-notice" role="alert">최신 조회가 지연되어 마지막 저장 내용을 표시합니다. 예약·발행 전에 새로고침해주세요.</div>
      ) : freshness?.source === "postgres-cache" ? (
        <div className="operations-notice" role="status">마지막 저장 내용을 표시합니다. 필요하면 새로고침해주세요.</div>
      ) : null}
      <section className="schedule-list">
        {loading && !contents.length ? <div className="operations-empty schedule-loading-state" role="status">발행 일정을 불러오는 중입니다.</div> : contents.map((content) => {
          const mapped = mapContent(content);
          return (
            <article key={content.id}>
              <header><h2>{content.title}</h2><StatusBadge status={mapped.status} /></header>
              {content.state === "approved" ? <div className="schedule-control"><label><span>발행 예정</span><input type="datetime-local" value={dates[content.id] ?? ""} disabled={loading || actionBusy !== null} onChange={(event) => setDates((current) => ({ ...current, [content.id]: event.target.value }))} /></label><Button variant="brand" onClick={() => void schedule(content)} disabled={loading || actionBusy !== null || !dates[content.id]}>{actionBusy?.contentId === content.id && actionBusy.action === "schedule" ? "저장 중..." : "예약 저장"}</Button></div> : null}
              {content.state === "scheduled" ? <div className="schedule-control"><label><span>네이버 게시 URL</span><input type="url" placeholder="https://blog.naver.com/..." value={urls[content.id] ?? ""} disabled={loading || actionBusy !== null} onChange={(event) => setUrls((current) => ({ ...current, [content.id]: event.target.value }))} /></label><Button variant="brand" icon={<CheckCircle2 size={17} />} onClick={() => void published(content)} disabled={loading || actionBusy !== null || !urls[content.id]?.trim()}>{actionBusy?.contentId === content.id && actionBusy.action === "publish" ? "처리 중..." : "발행 완료"}</Button></div> : null}
              {content.state === "published" && content.publishedAt ? <p className="published-link">발행 기록 {new Date(content.publishedAt).toLocaleString("ko-KR")}</p> : null}
            </article>
          );
        })}
        {!loading && !contents.length ? <div className="operations-empty">승인되거나 예약된 원고가 없습니다.</div> : null}
      </section>
    </div>
  );
}
