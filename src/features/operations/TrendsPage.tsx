import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collectTrends, getTrends } from "../../api/client";
import type { ApiTrendSnapshot } from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";

function searchTrendLabel(item: ApiTrendSnapshot["items"][number]) {
  const trend = item.bestSearchTrend;
  if (!trend || trend.direction === "insufficient") return null;
  if (trend.direction === "rising") return `검색 상승 ${trend.changePercent != null ? `+${trend.changePercent}%` : ""}`.trim();
  if (trend.direction === "falling") return `검색 하락 ${trend.changePercent != null ? `${trend.changePercent}%` : ""}`.trim();
  return "검색 유지";
}

function scoreBreakdownLabel(item: ApiTrendSnapshot["items"][number]) {
  const score = item.scoreBreakdown;
  if (!score) return null;
  const parts = [
    ["정확도", score.similarityRank],
    ["관련성", score.keywordRelevance],
    ["검색 수요", score.relativeDemand],
    ["최근 추이", score.trendMomentum],
    ["4주 재등장", score.fourWeekPersistence],
    ["최신성", score.freshness],
    ["검색의도", score.intentFit],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return parts.length ? parts.map(([label, value]) => `${label} ${value}`).join(" · ") : null;
}

export function TrendsPage() {
  const [snapshot, setSnapshot] = useState<ApiTrendSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async (signal?: AbortSignal, initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setMessage("");
    try {
      setSnapshot(await getTrends(signal, true));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "수집 결과를 불러오지 못했습니다.");
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal, true);
    return () => controller.abort();
  }, []);
  const items = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    return (snapshot?.items ?? []).filter((item) => !keyword || `${item.title} ${item.description}`.toLocaleLowerCase("ko").includes(keyword)).slice(0, 40);
  }, [query, snapshot]);

  const collect = async () => {
    setBusy(true);
    try {
      await collectTrends();
      setMessage("수집 작업을 시작했습니다. 완료 후 새로고침하면 최신 결과가 표시됩니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수집 실행에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="operations-page">
      <header className="operations-heading">
        <div><h1>소재 후보 수집</h1><p>정확도순 상위 노출, 최신성, 최근 4주 재등장과 검색 관심도 방향을 함께 확인하세요.</p></div>
        <div className="operations-actions"><Button onClick={() => void refresh()} icon={<RefreshCw size={17} />} disabled={loading || refreshing}>{refreshing ? "최신화 중..." : "새로고침"}</Button><Button variant="brand" onClick={() => void collect()} disabled={busy || loading || refreshing}>{busy ? "요청 중..." : "지금 수집"}</Button></div>
      </header>
      {message ? <div className="operations-notice" role="status">{message}</div> : null}
      {loading ? <PageLoadingState label="최신 수집 결과를 불러오는 중입니다." /> : !snapshot ? (
        <div className="operations-empty">표시할 수집 결과가 없습니다. 잠시 후 새로고침해주세요.</div>
      ) : (
        <>
          <div className="operations-notice" role={snapshot.source === "postgres-cache" ? "alert" : undefined}>
            {snapshot.source === "postgres-cache"
              ? `GitHub 최신 조회가 지연되어 ${snapshot.collectionDate}에 저장된 수집 결과를 표시합니다.`
              : snapshot.searchTrend?.status === "ok"
                ? "선별 점수는 정확도순 위치·반복 노출·최신성·4주 재등장·검색 관심도 방향을 조합합니다. 검색 관심도는 최근 7일과 직전 21일의 상대 추이이며 절대 검색량이 아닙니다."
                : "검색어 트렌드는 아직 연결되지 않았습니다. 정확도순 위치·반복 노출·최신성·4주 재등장으로 선별하며 조회수·공감·댓글은 공식 API 미제공 항목입니다."}
          </div>
          <section className="snapshot-summary">
            <div><small>수집일</small><strong>{snapshot.collectionDate}</strong></div>
            <div><small>검색어</small><strong>{snapshot.queryCount}개</strong></div>
            <div><small>수집 결과</small><strong>{snapshot.itemCount}개</strong></div>
          </section>
          <div className="operations-toolbar"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목과 내용으로 검색" /></label></div>
          <section className="trend-list" aria-label="수집 콘텐츠">
            {items.map((item) => {
              const trendLabel = searchTrendLabel(item);
              const breakdownLabel = scoreBreakdownLabel(item);
              return <a key={item.link} href={item.link} target="_blank" rel="noreferrer">
                <div><strong>{item.title}</strong><p>{item.description}</p><small>{item.bloggername} · {item.postdate} · {item.matchedQueries.join(", ")}</small>{breakdownLabel ? <small className="trend-score-breakdown">{breakdownLabel}</small> : null}</div>
                <span className="trend-signals" title="정확도순 위치는 NAVER API HUB 블로그 검색 결과이며 통합검색 화면 순위와 동일하다고 보장되지 않습니다.">
                  <small>{item.bestSimilarityRank ? `정확도 ${item.bestSimilarityRank}위` : "정확도 순위 없음"}</small>
                  {item.bestRecentRank ? <small>최신 {item.bestRecentRank}위</small> : null}
                  <small>4주간 {item.observedDays ?? 1}일 포착</small>
                  {trendLabel ? <small className={`trend-signal--${item.bestSearchTrend?.direction}`}>{trendLabel}</small> : null}
                  <b>선별 {Math.round(item.candidateScore)}</b>
                  <ExternalLink size={16} />
                </span>
              </a>;
            })}
            {!items.length ? <div className="operations-empty">표시할 수집 결과가 없습니다.</div> : null}
          </section>
        </>
      )}
    </div>
  );
}
