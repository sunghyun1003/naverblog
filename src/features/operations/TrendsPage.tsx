import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collectTrends, getTrends } from "../../api/client";
import type { ApiTrendSnapshot } from "../../api/types";
import { Button } from "../../components/Button";

export function TrendsPage() {
  const [snapshot, setSnapshot] = useState<ApiTrendSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => setSnapshot(await getTrends());
  useEffect(() => { void refresh(); }, []);
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
        <div><h1>트렌드 수집</h1><p>네이버 블로그에서 수집한 보험 콘텐츠 후보를 확인하세요.</p></div>
        <div className="operations-actions"><Button onClick={() => void refresh()} icon={<RefreshCw size={17} />}>새로고침</Button><Button variant="brand" onClick={() => void collect()} disabled={busy}>{busy ? "요청 중..." : "지금 수집"}</Button></div>
      </header>
      {message ? <div className="operations-notice" role="status">{message}</div> : null}
      <section className="snapshot-summary">
        <div><small>수집일</small><strong>{snapshot?.collectionDate ?? "-"}</strong></div>
        <div><small>검색어</small><strong>{snapshot?.queryCount ?? 0}개</strong></div>
        <div><small>수집 결과</small><strong>{snapshot?.itemCount ?? 0}개</strong></div>
      </section>
      <div className="operations-toolbar"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목과 내용으로 검색" /></label></div>
      <section className="trend-list" aria-label="수집 콘텐츠">
        {items.map((item) => (
          <a key={item.link} href={item.link} target="_blank" rel="noreferrer">
            <div><strong>{item.title}</strong><p>{item.description}</p><small>{item.bloggername} · {item.postdate} · {item.matchedQueries.join(", ")}</small></div>
            <span><b>{Math.round(item.candidateScore)}</b><ExternalLink size={16} /></span>
          </a>
        ))}
        {!items.length ? <div className="operations-empty">표시할 수집 결과가 없습니다.</div> : null}
      </section>
    </div>
  );
}
