import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAutomationHistory } from "../../api/client";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";
import type { ApiAutomationHistoryItem } from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";

const workflowLabels: Record<ApiAutomationHistoryItem["workflow"], string> = {
  collect: "콘텐츠 수집",
  generate: "원고 생성",
  images: "이미지 생성",
  rewrite: "원고 수정",
};

const statusLabels: Record<ApiAutomationHistoryItem["status"], string> = {
  success: "성공",
  failure: "실패",
  cancelled: "취소",
  running: "실행 중",
  queued: "대기 중",
  skipped: "건너뜀",
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return "-";
  if (value < 60) return `${value}초`;
  return `${Math.floor(value / 60)}분 ${value % 60}초`;
}

function formatTokens(item: ApiAutomationHistoryItem): string {
  if (!item.codex.calls) return item.workflow === "collect" ? "Codex 미사용" : "기록 없음";
  return `${new Intl.NumberFormat("ko-KR").format(item.codex.totalTokens)} 토큰 · ${item.codex.calls}회`;
}

export function AutomationHistoryPage() {
  const cached = readRuntimeCache<{ items: ApiAutomationHistoryItem[] }>("automation:history");
  const [items, setItems] = useState(cached?.items ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [workflow, setWorkflow] = useState<"all" | ApiAutomationHistoryItem["workflow"]>("all");
  const [status, setStatus] = useState<"all" | "success" | "failure">("all");

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await listAutomationHistory(signal);
      setItems(response.items);
      writeRuntimeCache("automation:history", response);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "실행 이력을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const workflowMatches = workflow === "all" || item.workflow === workflow;
    const statusMatches = status === "all" || item.status === status;
    return workflowMatches && statusMatches;
  }), [items, status, workflow]);

  return (
    <div className="operations-page history-page">
      <header className="operations-heading">
        <div><h1>실행 이력</h1><p>수집·원고·이미지 작업의 결과와 Codex 사용량을 확인하세요.</p></div>
        <Button icon={<RefreshCw size={17} />} onClick={() => void refresh()} disabled={loading}>{loading ? "확인 중..." : "새로고침"}</Button>
      </header>
      <section className="operations-section history-section">
        <div className="history-toolbar">
          <label><span>작업</span><select value={workflow} onChange={(event) => setWorkflow(event.target.value as typeof workflow)}><option value="all">전체 작업</option><option value="collect">콘텐츠 수집</option><option value="generate">원고 생성</option><option value="images">이미지 생성</option><option value="rewrite">원고 수정</option></select></label>
          <label><span>결과</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">전체 결과</option><option value="success">성공</option><option value="failure">실패</option></select></label>
        </div>
        {loading && !items.length ? <PageLoadingState label="실행 이력을 불러오는 중입니다." compact /> : null}
        {error ? <div className="operations-notice" role="alert">{error}</div> : null}
        <div className="history-table" role="table" aria-label="자동화 실행 이력">
          <div className="history-table__head" role="row"><span>작업</span><span>시작 시각</span><span>대상 콘텐츠</span><span>결과</span><span>소요 시간</span><span>Codex 사용량</span><span>상세</span></div>
          {filtered.map((item) => (
            <article className="history-table__row" role="row" key={item.id}>
              <div data-label="작업"><strong>{workflowLabels[item.workflow]}</strong><small>{item.event === "schedule" ? "자동 예약" : "직접 실행"}</small></div>
              <time data-label="시작 시각">{formatDateTime(item.startedAt)}</time>
              <div data-label="대상 콘텐츠">{item.contentRunId && item.contentTitle ? <Link to={`/contents/${item.contentRunId}`}>{item.contentTitle}</Link> : item.contentRunId ? <span>원고 {item.contentRunId}</span> : <span>-</span>}</div>
              <div data-label="결과"><span className={`history-status history-status--${item.status}`}>{statusLabels[item.status]}</span>{item.failedStage ? <small>{item.failedStage}</small> : null}</div>
              <span data-label="소요 시간">{formatDuration(item.durationSeconds)}</span>
              <div data-label="Codex 사용량"><strong>{formatTokens(item)}</strong>{item.codex.calls ? <small>입력 {item.codex.inputTokens.toLocaleString("ko-KR")} · 출력 {item.codex.outputTokens.toLocaleString("ko-KR")}</small> : null}</div>
              <a data-label="상세" href={item.url} target="_blank" rel="noreferrer" aria-label={`${workflowLabels[item.workflow]} GitHub 실행 보기`}><ExternalLink size={17} /></a>
            </article>
          ))}
          {!filtered.length && !loading ? <div className="operations-empty">조건에 맞는 실행 이력이 없습니다.</div> : null}
        </div>
      </section>
    </div>
  );
}
