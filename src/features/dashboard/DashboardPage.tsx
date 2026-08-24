import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  Filter,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { contentStatusLabel } from "../../data/content";
import type { ContentStatus } from "../../types/content";
import { CreateContentDialog } from "./CreateContentDialog";
import { useContents } from "./useContents";

const filters: Array<{ key: "all" | ContentStatus; label: string }> = [
  { key: "all", label: "전체" },
  { key: "planning", label: "기획" },
  { key: "drafting", label: "작성 중" },
  { key: "review", label: "검토 필요" },
  { key: "approved", label: "승인 완료" },
  { key: "scheduled", label: "예약" },
  { key: "published", label: "발행 완료" },
];

const isHostedPreview = import.meta.env.VITE_PREVIEW_MODE === "true";

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contents, connectionStatus, capabilities, freshness, creating, createAndRun } = useContents();
  const requestedFilter = searchParams.get("filter");
  const activeFilter: "all" | ContentStatus = requestedFilter && filters.some((filter) => filter.key === requestedFilter)
    ? requestedFilter as ContentStatus
    : "all";
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState("");

  const setActiveFilter = (filter: "all" | ContentStatus) => {
    const next = new URLSearchParams(searchParams);
    if (filter === "all") next.delete("filter");
    else next.set("filter", filter);
    setSearchParams(next, { replace: true });
  };

  const filteredContents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return contents.filter((content) => {
      const matchesStatus = activeFilter === "all" || content.status === activeFilter;
      const matchesQuery = !normalizedQuery || content.title.toLocaleLowerCase("ko").includes(normalizedQuery);
      const matchesMine = !mineOnly || content.assignee === "carrot";
      return matchesStatus && matchesQuery && matchesMine;
    });
  }, [activeFilter, contents, mineOnly, query]);

  const reviewCount = contents.filter((content) => content.status === "review").length;
  const scheduledCount = contents.filter((content) => content.status === "scheduled").length;
  const freshnessLabel = freshness?.asOf
    ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(freshness.asOf))
    : "확인 시각 없음";
  const recentActivities = contents.slice(0, 4).map((content) => ({
    id: content.id,
    title: content.title,
    message: `현재 상태: ${contentStatusLabel[content.status]}`,
    time: content.updatedAt,
    tone: content.status === "review" ? "brand" : content.status === "scheduled" ? "info" : "neutral",
  }));

  const handleCreate = async (title: string, strategy: "trend" | "original") => {
    if (connectionStatus !== "connected") {
      setToast("자동화 서버 연결을 확인한 뒤 다시 시도해주세요.");
      window.setTimeout(() => setToast(""), 3600);
      return;
    }
    try {
      await createAndRun(title, strategy);
      setToast("원고 생성 작업을 시작했어요. 완료되면 목록에 자동으로 표시됩니다.");
      setCreateOpen(false);
      setActiveFilter("all");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "자동화 실행에 실패했습니다.");
    }
    window.setTimeout(() => setToast(""), 3600);
  };

  return (
    <div className="dashboard-page">
      <section className="dashboard-main">
        <header className="page-heading">
          <div>
            <h1>콘텐츠 운영</h1>
            <p>기획부터 발행까지 한곳에서 관리하세요.</p>
          </div>
          <Button variant="brand" icon={<Plus size={18} />} onClick={() => setCreateOpen(true)} disabled={connectionStatus !== "connected"}>
            콘텐츠 만들기
          </Button>
        </header>

        <div className={`system-status system-status--${freshness?.stale ? "offline" : connectionStatus}`} role="status">
          <span className="system-status__dot" />
          <div>
            <strong>
              {connectionStatus === "connected"
                ? freshness?.stale
                  ? "최신 원고 연결 실패 · 저장 데이터 표시 중"
                  : freshness?.source === "postgres-cache"
                    ? "운영 DB 목록 표시 중"
                  : capabilities?.mode === "github-actions"
                  ? "GitHub Actions 자동화 연결됨"
                  : "로컬 검증 파이프라인 연결됨"
                : connectionStatus === "connecting"
                  ? "자동화 서버 연결 확인 중"
                  : isHostedPreview
                    ? "웹 미리보기 모드"
                    : "자동화 서버 연결 대기"}
            </strong>
            <small>
              {connectionStatus === "connected"
                ? freshness?.stale
                  ? `저장 데이터 기준 ${freshnessLabel} · 승인이나 반려 전 다시 접속해 최신 상태를 확인해주세요.`
                  : freshness?.source === "postgres-cache"
                    ? `최근 원고 갱신 ${freshnessLabel} · 새 원고는 확인했고, 상세 화면에서는 GitHub 최신 상태를 다시 검증합니다.`
                  : capabilities?.mode === "github-actions"
                  ? "비공개 자동화 저장소 · 수집·생성·말투 보정 사용 가능"
                  : "모의 데이터로 생성·검수·승인 흐름을 확인할 수 있습니다."
                : connectionStatus === "connecting"
                  ? "실제 콘텐츠와 자동화 상태를 확인하고 있습니다."
                  : isHostedPreview
                  ? "운영 데이터 API에 연결해야 콘텐츠를 조회하고 생성할 수 있습니다."
                  : "자동화 서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요."}
            </small>
          </div>
        </div>

        <section className="status-strip" aria-label="오늘의 콘텐츠 상태">
          <button type="button" onClick={() => setActiveFilter("review")}>
            <span className="status-strip__icon status-strip__icon--brand"><Clock3 size={21} /></span>
            <span><small>검토 대기</small><strong>{connectionStatus === "connecting" ? "-" : reviewCount}</strong></span>
          </button>
          <button type="button" onClick={() => setActiveFilter("scheduled")}>
            <span className="status-strip__icon status-strip__icon--info"><CalendarCheck2 size={21} /></span>
            <span><small>오늘 예약</small><strong>{connectionStatus === "connecting" ? "-" : scheduledCount}</strong></span>
          </button>
          <button type="button" onClick={() => navigate("/trends")}>
            <span className="status-strip__icon status-strip__icon--positive"><FileCheck2 size={21} /></span>
            <span><small>트렌드 수집</small><strong>{capabilities?.integrations.naverSearch.configured ? "ON" : "-"}</strong></span>
          </button>
        </section>

        <div className="segmented-filter" role="group" aria-label="진행 상태 필터">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-pressed={activeFilter === filter.key}
              className={activeFilter === filter.key ? "segmented-filter__item--active" : ""}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="content-toolbar">
          <label className="search-field">
            <Search size={19} aria-hidden="true" />
            <span className="sr-only">콘텐츠 검색</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="콘텐츠 제목으로 검색" />
          </label>
          <div className="filter-control">
            <button
              type="button"
              className={`icon-button icon-button--bordered ${mineOnly ? "icon-button--selected" : ""}`}
              aria-label="필터 옵션"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((current) => !current)}
            >
              <Filter size={19} />
            </button>
            {filterOpen ? (
              <div className="filter-popover">
                <label>
                  <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
                  내 담당만 보기
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="content-table" role="region" aria-label="콘텐츠 목록" tabIndex={0}>
          <div className="content-table__header" role="row">
            <span>콘텐츠</span><span>상태</span><span>담당자</span><span>업데이트</span><span>발행 예정</span><span />
          </div>
          <div className="content-table__body">
            {connectionStatus === "connecting" ? (
              <div className="content-list-loading" role="status"><span className="page-loading__spinner" aria-hidden="true" />실제 콘텐츠를 불러오는 중입니다.</div>
            ) : filteredContents.length ? filteredContents.map((content) => (
              <button key={content.id} type="button" className="content-row" onClick={() => navigate(`/contents/${content.id}`)}>
                <span className="content-row__title">{content.title}</span>
                <span><StatusBadge status={content.status} /></span>
                <span className="assignee"><span className="avatar">{content.initials}</span>{content.assignee}</span>
                <span className="content-row__meta" data-label="업데이트">{content.updatedAt}</span>
                <span className="content-row__meta" data-label="발행 예정">{content.publishAt ?? "-"}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )) : (
              <div className="empty-list">
                <strong>조건에 맞는 콘텐츠가 없어요.</strong>
                <span>검색어나 필터를 바꿔보세요.</span>
              </div>
            )}
          </div>
          <footer className="table-footer">
            <span>{filteredContents.length ? `1–${filteredContents.length}` : "0"} / {filteredContents.length}개</span>
            <div className="pagination" aria-label="페이지 이동">
              <button type="button" aria-label="이전 페이지" disabled><ChevronLeft size={18} /></button>
              <button type="button" className="pagination__current" aria-current="page">1</button>
              <button type="button" aria-label="다음 페이지" disabled><ChevronRight size={18} /></button>
            </div>
            <span>10개씩</span>
          </footer>
        </div>
      </section>

      <aside className="task-rail">
        <section>
          <h2>오늘 할 일</h2>
          <button type="button" className="task-item" onClick={() => setActiveFilter("review")}>
            <span className="task-item__icon task-item__icon--brand"><FileCheck2 size={20} /></span>
            <span><strong>원고 검토</strong><small>{connectionStatus === "connecting" ? "-" : `${reviewCount}건`}</small></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="task-item" onClick={() => setActiveFilter("scheduled")}>
            <span className="task-item__icon task-item__icon--info"><CalendarCheck2 size={20} /></span>
            <span><strong>예약 확인</strong><small>{connectionStatus === "connecting" ? "-" : `${scheduledCount}건`}</small></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="task-item" onClick={() => {
            const reviewItem = contents.find((content) => content.status === "review");
            if (reviewItem) navigate(`/contents/${reviewItem.id}`);
          }}>
            <span className="task-item__icon task-item__icon--positive"><FileCheck2 size={20} /></span>
            <span><strong>자료 출처 확인</strong><small>{connectionStatus === "connecting" ? "-" : `${reviewCount}건`}</small></span>
            <ChevronRight size={18} />
          </button>
        </section>

        <section className="activity-section">
          <h2>최근 활동</h2>
          {recentActivities.map((activity) => (
            <div className="activity-item" key={activity.id}>
              <span className="avatar">{activity.title.slice(0, 1)}</span>
              <div>
                <strong><span className={`activity-dot activity-dot--${activity.tone}`} />{activity.title}</strong>
                <p>{activity.message}</p>
                <small>{activity.time}</small>
              </div>
            </div>
          ))}
          {!recentActivities.length && connectionStatus !== "connecting" ? <p className="activity-empty">최근 활동이 없습니다.</p> : null}
        </section>
      </aside>

      <CreateContentDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} busy={creating} />
      {toast ? <div className="snackbar" role="status">{toast}</div> : null}
    </div>
  );
}
