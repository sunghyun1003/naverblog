import { Bot, Database, FileCheck2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getCapabilities, listContents, listWorkflowRuns } from "../../api/client";
import type { ApiCapabilities, ApiContent, ApiFreshness, ApiWorkflowRun } from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";

function runLabel(run: ApiWorkflowRun | undefined): string {
  if (!run) return "실행 기록 없음";
  if (run.status !== "completed") return "실행 중";
  return run.conclusion === "success" ? "정상 완료" : "확인 필요";
}

export function HomePage() {
  const [contents, setContents] = useState<ApiContent[]>([]);
  const [runs, setRuns] = useState<ApiWorkflowRun[]>([]);
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(null);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [contentResponse, runResponse, capabilityResponse] = await Promise.all([
        listContents(signal),
        listWorkflowRuns(signal),
        getCapabilities(signal),
      ]);
      setContents(contentResponse.items);
      setFreshness(contentResponse.freshness ?? null);
      setRuns(runResponse.items);
      setCapabilities(capabilityResponse);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "운영 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  const collectRun = runs.find((run) => run.workflow === "collect");
  const generateRun = runs.find((run) => run.workflow === "generate");
  const reviewCount = contents.filter((content) => content.state === "review_ready").length;

  return (
    <div className="operations-page">
      <header className="operations-heading">
        <div><h1>홈</h1><p>오늘의 자동화 상태와 검토할 원고를 확인하세요.</p></div>
        <Button icon={<RefreshCw size={17} />} onClick={() => void refresh()} disabled={loading}>새로고침</Button>
      </header>
      {loading && !capabilities ? <PageLoadingState label="최신 자동화 상태를 불러오는 중입니다." /> : error && !capabilities ? (
        <div className="operations-empty">운영 상태를 불러오지 못했습니다. 새로고침해주세요.</div>
      ) : (
        <>
          {freshness?.stale ? (
            <div className="operations-notice" role="alert">GitHub 최신 조회가 지연되어 마지막 동기화 데이터를 표시합니다. 콘텐츠 화면에서 최신 상태를 다시 확인해주세요.</div>
          ) : freshness?.source === "postgres-cache" ? (
            <div className="operations-notice" role="status">빠른 조회를 위해 마지막 동기화 데이터를 표시합니다. 최신 검수 상태는 콘텐츠 화면에서 확인할 수 있습니다.</div>
          ) : null}
          <section className="operations-summary" aria-label="운영 요약">
            <article><span className="operation-icon operation-icon--brand"><FileCheck2 size={21} /></span><small>검토 대기</small><strong>{reviewCount}건</strong></article>
            <article><span className="operation-icon operation-icon--positive"><Database size={21} /></span><small>최근 수집</small><strong>{runLabel(collectRun)}</strong></article>
            <article><span className="operation-icon operation-icon--info"><Bot size={21} /></span><small>최근 생성</small><strong>{runLabel(generateRun)}</strong></article>
          </section>
          <section className="operations-section">
            <header><h2>연동 상태</h2><p>운영 서버가 확인한 실제 연결 상태입니다.</p></header>
            <div className="integration-list">
              {Object.entries(capabilities?.integrations ?? {}).map(([name, integration]) => (
                <div key={name}><span className={`integration-dot ${integration.configured ? "integration-dot--on" : ""}`} /><strong>{name}</strong><small>{integration.provider}</small><b>{integration.configured ? "연결됨" : "미연동"}</b></div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
