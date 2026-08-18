import { Bot, Database, FileCheck2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getCapabilities, listContents, listWorkflowRuns } from "../../api/client";
import type { ApiCapabilities, ApiContent, ApiWorkflowRun } from "../../api/types";
import { Button } from "../../components/Button";

function runLabel(run: ApiWorkflowRun | undefined): string {
  if (!run) return "실행 기록 없음";
  if (run.status !== "completed") return "실행 중";
  return run.conclusion === "success" ? "정상 완료" : "확인 필요";
}

export function HomePage() {
  const [contents, setContents] = useState<ApiContent[]>([]);
  const [runs, setRuns] = useState<ApiWorkflowRun[]>([]);
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [contentResponse, runResponse, capabilityResponse] = await Promise.all([
        listContents(),
        listWorkflowRuns(),
        getCapabilities(),
      ]);
      setContents(contentResponse.items);
      setRuns(runResponse.items);
      setCapabilities(capabilityResponse);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  const collectRun = runs.find((run) => run.workflow === "collect");
  const generateRun = runs.find((run) => run.workflow === "generate");
  const reviewCount = contents.filter((content) => content.state === "review_ready").length;

  return (
    <div className="operations-page">
      <header className="operations-heading">
        <div><h1>홈</h1><p>오늘의 자동화 상태와 검토할 원고를 확인하세요.</p></div>
        <Button icon={<RefreshCw size={17} />} onClick={() => void refresh()} disabled={loading}>새로고침</Button>
      </header>
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
    </div>
  );
}
