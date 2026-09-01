import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listAutomationHistory } from "../../api/client";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";
import type { ApiAutomationHistoryItem } from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";
import { estimateTokenCostUsd, formatUsd } from "../../api/tokenCost";

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
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function formatDuration(value: number | null): string {
  if (value === null) return "-";
  if (value < 60) return `${value}초`;
  return `${Math.floor(value / 60)}분 ${value % 60}초`;
}

function formatTokens(item: ApiAutomationHistoryItem): string {
  if (!item.codex.calls) return item.workflow === "collect" ? "0 토큰" : "기록 없음";
  return `${new Intl.NumberFormat("ko-KR").format(item.codex.totalTokens)} 토큰`;
}

function formatFailedStage(item: ApiAutomationHistoryItem): string | null {
  if (!item.failedStage) return null;
  const stage = item.failedStage.toLocaleLowerCase("en");
  if (stage.includes("preflight")) return "생성 전 점검에서 중단";
  if (stage.includes("image")) return "이미지 처리 중 중단";
  if (stage.includes("tone") || stage.includes("rewrite")) return "문장 보정 중 중단";
  if (stage.includes("save") || stage.includes("push")) return "결과 저장 중 중단";
  if (stage.includes("codex") || stage.includes("generate")) return "원고 생성 중 중단";
  return "세부 처리 단계에서 중단";
}

const pageSize = 10;

export function AutomationHistoryPage() {
  const [searchParams] = useSearchParams();
  const cached = readRuntimeCache<{ items: ApiAutomationHistoryItem[] }>("automation:history");
  const [items, setItems] = useState(cached?.items ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [workflow, setWorkflow] = useState<"all" | ApiAutomationHistoryItem["workflow"]>("all");
  const requestedStatus = searchParams.get("status");
  const [status, setStatus] = useState<"all" | "success" | "failure">(
    requestedStatus === "success" || requestedStatus === "failure" ? requestedStatus : "all",
  );
  const [page, setPage] = useState(1);

  const refresh = async (signal?: AbortSignal) => {
    setLoading(items.length === 0);
    setRefreshing(true);
    setError("");
    try {
      const response = await listAutomationHistory(signal);
      setItems(response.items);
      writeRuntimeCache("automation:history", response);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "실행 이력을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
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
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [status, workflow]);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);
  useEffect(() => {
    if (requestedStatus === "success" || requestedStatus === "failure") setStatus(requestedStatus);
  }, [requestedStatus]);

  return (
    <div className="operations-page history-page">
      <header className="operations-heading">
        <Button icon={<RefreshCw size={17} />} onClick={() => void refresh()} disabled={loading || refreshing}>{refreshing ? "확인 중..." : "새로고침"}</Button>
      </header>
      <section className="operations-section history-section">
        <div className="history-toolbar">
          <label><span>작업</span><select value={workflow} onChange={(event) => setWorkflow(event.target.value as typeof workflow)}><option value="all">전체 작업</option><option value="collect">콘텐츠 수집</option><option value="generate">원고 생성</option><option value="images">이미지 생성</option><option value="rewrite">원고 수정</option></select></label>
          <label><span>결과</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">전체 결과</option><option value="success">성공</option><option value="failure">실패</option></select></label>
        </div>
        {loading && !items.length ? <PageLoadingState label="실행 이력을 불러오는 중입니다." compact /> : null}
        {error ? <div className="operations-notice" role="alert">{error}</div> : null}
        <div className="history-table" role="table" aria-label="자동화 실행 이력">
          <div className="history-table__head" role="row"><span>작업</span><span>시작 시각</span><span>대상 콘텐츠</span><span>결과</span><span>소요 시간</span><span>토큰 사용량</span><span>상세</span></div>
          {pageItems.map((item) => (
            <article className="history-table__row" role="row" key={item.id}>
              <div data-label="작업"><strong>{workflowLabels[item.workflow]}</strong><small>{item.event === "schedule" ? "자동 예약" : "직접 실행"}</small></div>
              <time data-label="시작 시각">{formatDateTime(item.startedAt)}</time>
              <div data-label="대상 콘텐츠">{item.contentRunId && item.contentTitle ? <Link to={`/contents/${item.contentRunId}`}>{item.contentTitle}</Link> : item.contentRunId ? <span>원고 {item.contentRunId}</span> : <span>-</span>}</div>
              <div data-label="결과"><span className={`history-status history-status--${item.status}`}>{statusLabels[item.status]}</span>{formatFailedStage(item) ? <small>{formatFailedStage(item)}</small> : null}{item.recoveryAction === "image_retry" ? <small className="history-recovery-note">이미지 품질 검수 실패 · 이미지 재생성 가능</small> : item.recoveryAction === "tone_resume" || item.draftSaved ? <small className="history-recovery-note">원고 저장됨 · 저장 원고 재시도 가능</small> : null}</div>
              <span data-label="소요 시간">{formatDuration(item.durationSeconds)}</span>
              <div data-label="토큰 사용량"><strong>{formatTokens(item)}</strong><small>{item.codex.calls ? `예상 비용 ${formatUsd(estimateTokenCostUsd(item))} · 생성 모델 단가 참고(검증 모델 호출은 별도 미분리)` : item.workflow === "collect" ? "생성 모델을 사용하지 않은 수집 작업" : "토큰 사용량이 기록되지 않은 실행"}</small>{item.codex.calls ? <small>입력 {item.codex.inputTokens.toLocaleString("ko-KR")} · 캐시 {item.codex.cachedInputTokens.toLocaleString("ko-KR")} · 출력 {item.codex.outputTokens.toLocaleString("ko-KR")} · 호출 {item.codex.calls}회</small> : null}{item.codex.estimatedPromptTokens ? <small>프롬프트 길이 약 {item.codex.estimatedPromptTokens.toLocaleString("ko-KR")}토큰</small> : null}</div>
              <a data-label="상세" href={item.url} target="_blank" rel="noreferrer" aria-label={`${workflowLabels[item.workflow]} 실행 상세 보기`}><ExternalLink size={17} /></a>
            </article>
          ))}
          {!filtered.length && !loading ? <div className="operations-empty">조건에 맞는 실행 이력이 없습니다.</div> : null}
        </div>
        {filtered.length ? (
          <footer className="history-pagination">
            <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} / {filtered.length}개</span>
            <nav aria-label="실행 이력 페이지 이동">
              <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={18} /></button>
              <strong>{page} / {pageCount}</strong>
              <button type="button" aria-label="다음 페이지" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={18} /></button>
            </nav>
            <span>10개씩</span>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
