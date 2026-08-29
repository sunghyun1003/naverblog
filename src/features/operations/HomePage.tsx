import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCapabilities, getTrends, listContents, listWorkflowRuns } from "../../api/client";
import { mapContent } from "../../api/mapping";
import type {
  ApiCapabilities,
  ApiContent,
  ApiFreshness,
  ApiTrendSnapshot,
  ApiWorkflowRun,
} from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";

const integrationLabels: Record<string, string> = {
  ai: "Codex 원고 생성",
  naverSearch: "네이버 블로그 수집",
  publisher: "네이버 복사용 패키지",
  database: "운영 데이터 저장",
  automation: "GitHub Actions",
};

function runLabel(run: ApiWorkflowRun | undefined): string {
  if (!run) return "실행 기록 없음";
  if (run.status !== "completed") return "실행 중";
  if (run.conclusion === "success") return "정상 완료";
  if (run.conclusion === "cancelled") return "실행 취소";
  return "실패 확인 필요";
}

function runTone(run: ApiWorkflowRun | undefined): "neutral" | "running" | "success" | "failed" {
  if (!run) return "neutral";
  if (run.status !== "completed") return "running";
  return run.conclusion === "success" ? "success" : "failed";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCollectionDate(value: string): string {
  if (!value) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00+09:00`));
}

export function HomePage() {
  const navigate = useNavigate();
  const cachedContents = readRuntimeCache<{ items: ApiContent[]; freshness?: ApiFreshness }>("home:contents")
    ?? readRuntimeCache<{ contents: ApiContent[]; freshness: ApiFreshness | null }>("contents");
  const cachedTrends = readRuntimeCache<ApiTrendSnapshot>("trends");
  const cachedCapabilities = readRuntimeCache<ApiCapabilities>("capabilities");
  const initialContents = cachedContents && "items" in cachedContents ? cachedContents.items : cachedContents?.contents ?? [];
  const [contents, setContents] = useState<ApiContent[]>(initialContents);
  const [runs, setRuns] = useState<ApiWorkflowRun[]>([]);
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(cachedCapabilities);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(cachedContents?.freshness ?? null);
  const [trends, setTrends] = useState<ApiTrendSnapshot | null>(cachedTrends);
  const [loading, setLoading] = useState(!cachedContents && !cachedCapabilities && !cachedTrends);
  const [error, setError] = useState("");

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      listContents(signal),
      listWorkflowRuns(signal),
      getCapabilities(signal),
      getTrends(signal),
    ]);
    if (signal?.aborted) return;

    const [contentResult, runResult, capabilityResult, trendResult] = results;
    if (contentResult.status === "fulfilled") {
      setContents(contentResult.value.items);
      setFreshness(contentResult.value.freshness ?? null);
      writeRuntimeCache("home:contents", contentResult.value);
    }
    if (runResult.status === "fulfilled") setRuns(runResult.value.items);
    if (capabilityResult.status === "fulfilled") {
      setCapabilities(capabilityResult.value);
      writeRuntimeCache("capabilities", capabilityResult.value);
    }
    if (trendResult.status === "fulfilled") {
      setTrends(trendResult.value);
      writeRuntimeCache("trends", trendResult.value);
    }

    const failedCount = results.filter((result) => result.status === "rejected").length;
    if (failedCount === results.length) setError("운영 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    else if (failedCount > 0) setError("일부 운영 정보를 불러오지 못했습니다. 확인된 정보만 표시합니다.");
    setLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  const collectRun = runs.find((run) => run.workflow === "collect");
  const generateRun = runs.find((run) => run.workflow === "generate");
  const activeRun = [collectRun, generateRun].find((run) => run && run.status !== "completed");
  const failedRun = [collectRun, generateRun].find((run) => run?.status === "completed" && run.conclusion !== "success");
  const reviewCount = contents.filter((content) => content.state === "review_ready").length;
  const workingCount = contents.filter((content) => ["idea", "researching", "brief_ready", "drafting"].includes(content.state)).length;
  const approvedCount = contents.filter((content) => content.state === "approved").length;
  const scheduledCount = contents.filter((content) => content.state === "scheduled").length;
  const publishedCount = contents.filter((content) => ["published", "measured"].includes(content.state)).length;
  const recentContents = useMemo(
    () => [...contents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 5),
    [contents],
  );
  const visibleIntegrations = Object.entries(capabilities?.integrations ?? {})
    .filter(([key]) => key in integrationLabels);
  const connectedCount = visibleIntegrations.filter(([, value]) => value.configured).length;
  const hasOverview = Boolean(capabilities || contents.length || runs.length || trends);

  const nextAction = activeRun
    ? {
      tone: "info",
      icon: <Clock3 size={22} />,
      title: `${activeRun.workflow === "collect" ? "소재 수집" : "원고 생성"}이 진행 중입니다`,
      description: "완료될 때까지 다른 실행을 추가하지 않고 현재 작업을 기다려주세요.",
      label: "실행 보기",
      action: () => window.open(activeRun.url, "_blank", "noopener,noreferrer"),
    }
    : failedRun
      ? {
        tone: "critical",
        icon: <TriangleAlert size={22} />,
        title: `최근 ${failedRun.workflow === "collect" ? "소재 수집" : "원고 생성"}을 확인해주세요`,
        description: "자동화 실행이 정상 완료되지 않았습니다. 실행 기록에서 실패 원인을 확인할 수 있습니다.",
        label: "실패 기록 보기",
        action: () => window.open(failedRun.url, "_blank", "noopener,noreferrer"),
      }
      : reviewCount > 0
        ? {
          tone: "brand",
          icon: <FileCheck2 size={22} />,
          title: `검토할 원고가 ${reviewCount}건 있습니다`,
          description: "공식 근거와 광고 위험 문구를 확인한 뒤 승인 또는 반려해주세요.",
          label: "검토 시작",
          action: () => navigate("/contents?filter=review"),
        }
        : approvedCount > 0
          ? {
            tone: "positive",
            icon: <CalendarCheck2 size={22} />,
            title: `승인 완료 원고가 ${approvedCount}건 있습니다`,
            description: "발행 단계는 마지막에 진행합니다. 필요할 때 발행 일정에서 확인할 수 있습니다.",
            label: "승인 원고 보기",
            action: () => navigate("/contents?filter=approved"),
          }
          : {
            tone: "positive",
            icon: <CheckCircle2 size={22} />,
            title: "지금 바로 처리할 항목이 없습니다",
            description: "다음 자동 수집과 원고 생성 전까지 현재 운영 상태를 유지합니다.",
            label: "소재 후보 보기",
            action: () => navigate("/trends"),
          };

  return (
    <div className="operations-page home-page">
      <header className="operations-heading home-heading">
        <div><span className="home-eyebrow">BLOG OPERATIONS</span><h1>블로그 운영 현황</h1><p>소재 수집부터 원고 검토까지, 지금 확인할 내용을 한눈에 보세요.</p></div>
        <div className="operations-actions">
          <Button icon={<RefreshCw size={17} />} onClick={() => void refresh()} disabled={loading}>{loading ? "확인 중..." : "새로고침"}</Button>
          <Button variant="brand" onClick={() => navigate("/contents")}>콘텐츠 관리</Button>
        </div>
      </header>

      {loading && !hasOverview ? <PageLoadingState label="최신 운영 현황을 불러오는 중입니다." /> : error && !hasOverview ? (
        <div className="operations-empty">{error}</div>
      ) : (
        <>
          {error ? <div className="operations-notice" role="alert">{error}</div> : null}
          {freshness?.stale ? (
            <div className="operations-notice" role="alert">GitHub 최신 조회가 지연되어 마지막 동기화 데이터를 표시합니다.</div>
          ) : null}

          <section className={`home-next-action home-next-action--${nextAction.tone}`} aria-labelledby="next-action-title">
            <span className="home-next-action__icon">{nextAction.icon}</span>
            <div><small>지금 할 일</small><h2 id="next-action-title">{nextAction.title}</h2><p>{nextAction.description}</p></div>
            <Button variant={nextAction.tone === "brand" ? "brand" : "outline"} onClick={nextAction.action}>{nextAction.label}</Button>
          </section>

          <section className="home-status-grid" aria-label="콘텐츠 운영 요약">
            <Link to="/contents"><small>기획·작성 중</small><strong>{workingCount}</strong><span>건</span></Link>
            <Link to="/contents?filter=review"><small>검토 필요</small><strong>{reviewCount}</strong><span>건</span></Link>
            <Link to="/contents?filter=approved"><small>승인 완료</small><strong>{approvedCount}</strong><span>건</span></Link>
            <Link to="/contents?filter=scheduled"><small>발행 예약</small><strong>{scheduledCount}</strong><span>건</span></Link>
            <Link to="/contents?filter=published"><small>발행 완료</small><strong>{publishedCount}</strong><span>건</span></Link>
          </section>

          <div className="home-overview-grid">
            <section className="operations-section home-card">
              <header><div><h2>자동화 실행</h2><p>최근 수집·생성 작업의 실제 결과입니다.</p></div></header>
              <div className="home-run-list">
                {[{ label: "소재 수집", run: collectRun, icon: <Database size={19} /> }, { label: "원고 생성", run: generateRun, icon: <Bot size={19} /> }].map(({ label, run, icon }) => (
                  <a key={label} href={run?.url ?? undefined} target={run?.url ? "_blank" : undefined} rel={run?.url ? "noreferrer" : undefined} aria-disabled={!run?.url}>
                    <span className="home-run-icon">{icon}</span>
                    <span><strong>{label}</strong><small>{formatDateTime(run?.updatedAt)}</small></span>
                    <b className={`home-run-state home-run-state--${runTone(run)}`}>{runLabel(run)}</b>
                    {run?.url ? <ExternalLink size={15} /> : null}
                  </a>
                ))}
              </div>
            </section>

            <section className="operations-section home-card">
              <header><div><h2>최신 소재 수집</h2><p>원고 기획에 사용할 네이버 블로그 후보입니다.</p></div><Link className="home-text-link" to="/trends">전체 보기 <ArrowRight size={15} /></Link></header>
              {trends ? (
                <div className="home-trend-summary">
                  <div><small>수집일</small><strong>{formatCollectionDate(trends.collectionDate)}</strong></div>
                  <div><small>검색어</small><strong>{trends.queryCount}개</strong></div>
                  <div><small>후보</small><strong>{trends.itemCount}개</strong></div>
                  <p>{trends.items[0]?.title ?? "수집된 소재 후보가 없습니다."}</p>
                </div>
              ) : <div className="home-card-empty">수집 현황을 불러오지 못했습니다.</div>}
            </section>

            <section className="operations-section home-card">
              <header><div><h2>운영 환경</h2><p>현재 사용하는 핵심 연결만 표시합니다.</p></div><Link className="home-text-link" to="/settings">설정 보기 <ArrowRight size={15} /></Link></header>
              <div className="home-connection-summary">
                <span className="operation-icon operation-icon--positive"><Sparkles size={20} /></span>
                <div><strong>{connectedCount}/{visibleIntegrations.length} 연결</strong><p>{capabilities?.mode === "github-actions" ? "클라우드 자동화 운영 중" : "로컬 검증 환경"}</p></div>
              </div>
              <div className="home-connection-dots" aria-label="연동별 상태">
                {visibleIntegrations.map(([name, integration]) => <span key={name} title={`${integrationLabels[name]}: ${integration.configured ? "연결됨" : "미연동"}`} className={integration.configured ? "is-connected" : ""} />)}
              </div>
            </section>
          </div>

          <section className="operations-section home-recent-section">
            <header><div><h2>최근 원고</h2><p>가장 최근에 변경된 원고와 현재 단계를 확인하세요.</p></div><Link className="home-text-link" to="/contents">전체 콘텐츠 <ArrowRight size={15} /></Link></header>
            <div className="home-recent-list">
              {recentContents.map((content) => {
                const mapped = mapContent(content);
                return <Link key={content.id} to={`/contents/${content.id}`}>
                  <span className="home-document-icon"><FileCheck2 size={18} /></span>
                  <span><strong>{content.title}</strong><small>{formatDateTime(content.updatedAt)} 업데이트</small></span>
                  <StatusBadge status={mapped.status} />
                  <ArrowRight size={17} />
                </Link>;
              })}
              {!recentContents.length ? <div className="home-card-empty">아직 생성된 원고가 없습니다.</div> : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
