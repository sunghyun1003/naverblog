import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collectTrends, getTrends } from "../../api/client";
import type { ApiTrendSnapshot } from "../../api/types";
import { Button } from "../../components/Button";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";
import { isCurrentSeoulDate } from "../../api/date";

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
  const cachedSnapshot = readRuntimeCache<ApiTrendSnapshot>("trends");
  // Do not paint a several-day-old snapshot for a moment and then replace it
  // with the current response. A stale snapshot is still available as a
  // server fallback, but the first render should represent today's state.
  const usableCachedSnapshot = cachedSnapshot && isCurrentSeoulDate(cachedSnapshot.collectionDate)
    ? cachedSnapshot
    : null;
  const [snapshot, setSnapshot] = useState<ApiTrendSnapshot | null>(usableCachedSnapshot);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!usableCachedSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async (signal?: AbortSignal, initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setMessage("");
    try {
      const next = await getTrends(signal, !usableCachedSnapshot || !initial);
      writeRuntimeCache("trends", next);
      // A collection can be delayed (for example, when the scheduled
      // workflow is still queued). Keep the newest snapshot returned by the
      // API visible instead of turning the page blank just because its date
      // is not today. The notice below makes the freshness explicit and a
      // later refresh replaces it with today's snapshot automatically.
      setSnapshot(next);
      if (!isCurrentSeoulDate(next.collectionDate)) {
        setMessage(`${next.collectionDate} 수집 결과만 있습니다. 오늘 자료를 보려면 지금 수집을 실행해주세요.`);
      }
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
    void refresh(controller.signal, !usableCachedSnapshot);
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
    <div className="operations-page" aria-busy={loading || refreshing}>
      <header className="operations-heading">
        <div className="operations-actions"><Button onClick={() => void refresh()} icon={<RefreshCw size={17} />} disabled={loading || refreshing}>{refreshing ? "최신화 중..." : "새로고침"}</Button><Button variant="brand" onClick={() => void collect()} disabled={busy || loading || refreshing}>{busy ? "요청 중..." : "지금 수집"}</Button></div>
      </header>
      {message ? <div className="operations-notice" role="status">{message}</div> : null}
      {!snapshot ? (
        <div className="operations-empty trend-loading-state" role={loading ? "status" : undefined}>{loading ? "최신 수집 결과를 불러오는 중입니다." : "표시할 수집 결과가 없습니다. 잠시 후 새로고침해주세요."}</div>
      ) : (
        <>
          {!isCurrentSeoulDate(snapshot.collectionDate) ? <div className="operations-notice" role="alert">오늘 수집 결과가 아직 없습니다. 현재 표시된 자료는 {snapshot.collectionDate} 기준입니다.</div> : snapshot.source === "postgres-cache" ? <div className="operations-notice" role="alert">최신 조회가 지연되어 {snapshot.collectionDate}에 저장된 수집 결과를 표시합니다.</div> : null}
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
                <span className="trend-signals" title="검색 결과에서 확인된 노출 위치입니다.">
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
