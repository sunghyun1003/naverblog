import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { listContents, markContentPublished, scheduleContent } from "../../api/client";
import type { ApiContent } from "../../api/types";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { mapContent } from "../../api/mapping";

export function SchedulePage() {
  const [contents, setContents] = useState<ApiContent[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const refresh = async () => setContents((await listContents()).items.filter((content) => ["approved", "scheduled", "published"].includes(content.state)));
  useEffect(() => { void refresh(); }, []);

  const schedule = async (content: ApiContent) => {
    const value = dates[content.id];
    if (!value) return;
    try {
      await scheduleContent(content.id, new Date(value).toISOString());
      setMessage("발행 예정 시간을 저장했습니다.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "발행 일정 저장에 실패했습니다.");
    }
  };

  const published = async (content: ApiContent) => {
    const value = urls[content.id]?.trim();
    if (!value) return;
    try {
      await markContentPublished(content.id, value);
      setMessage("네이버 발행 URL을 저장했습니다.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "발행 URL 저장에 실패했습니다.");
    }
  };

  return (
    <div className="operations-page">
      <header className="operations-heading"><div><h1>발행 일정</h1><p>승인된 원고의 발행 예정 시간과 실제 게시 URL을 기록하세요.</p></div><Button icon={<RefreshCw size={17} />} onClick={() => void refresh()}>새로고침</Button></header>
      {message ? <div className="operations-notice" role="status">{message}</div> : null}
      <section className="schedule-list">
        {contents.map((content) => {
          const mapped = mapContent(content);
          return (
            <article key={content.id}>
              <header><div><h2>{content.title}</h2><p>실행 ID {content.id}</p></div><StatusBadge status={mapped.status} /></header>
              {content.state === "approved" ? <div className="schedule-control"><label><span>발행 예정</span><input type="datetime-local" value={dates[content.id] ?? ""} onChange={(event) => setDates((current) => ({ ...current, [content.id]: event.target.value }))} /></label><Button variant="brand" onClick={() => void schedule(content)} disabled={!dates[content.id]}>예약 저장</Button></div> : null}
              {content.state === "scheduled" ? <div className="schedule-control"><label><span>네이버 게시 URL</span><input type="url" placeholder="https://blog.naver.com/..." value={urls[content.id] ?? ""} onChange={(event) => setUrls((current) => ({ ...current, [content.id]: event.target.value }))} /></label><Button variant="brand" icon={<CheckCircle2 size={17} />} onClick={() => void published(content)} disabled={!urls[content.id]?.trim()}>발행 완료</Button></div> : null}
              {content.state === "published" && content.publishedAt ? <p className="published-link">발행 기록 {new Date(content.publishedAt).toLocaleString("ko-KR")}</p> : null}
            </article>
          );
        })}
        {!contents.length ? <div className="operations-empty">승인되거나 예약된 원고가 없습니다.</div> : null}
      </section>
    </div>
  );
}
