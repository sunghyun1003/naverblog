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
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { initialContents, recentActivities } from "../../data/content";
import type { ContentItem, ContentStatus } from "../../types/content";
import { CreateContentDialog } from "./CreateContentDialog";

const filters: Array<{ key: "all" | ContentStatus; label: string }> = [
  { key: "all", label: "전체" },
  { key: "planning", label: "기획" },
  { key: "drafting", label: "작성 중" },
  { key: "review", label: "검토 필요" },
  { key: "scheduled", label: "예약" },
  { key: "published", label: "발행 완료" },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [contents, setContents] = useState(initialContents);
  const [activeFilter, setActiveFilter] = useState<"all" | ContentStatus>("all");
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState("");

  const filteredContents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return contents.filter((content) => {
      const matchesStatus = activeFilter === "all" || content.status === activeFilter;
      const matchesQuery = !normalizedQuery || content.title.toLocaleLowerCase("ko").includes(normalizedQuery);
      const matchesMine = !mineOnly || content.assignee === "김서연";
      return matchesStatus && matchesQuery && matchesMine;
    });
  }, [activeFilter, contents, mineOnly, query]);

  const reviewCount = contents.filter((content) => content.status === "review").length;
  const scheduledCount = contents.filter((content) => content.status === "scheduled").length;

  const handleCreate = (title: string) => {
    const newContent: ContentItem = {
      id: `content-${Date.now()}`,
      title,
      status: "planning",
      assignee: "김서연",
      initials: "김",
      updatedAt: "방금",
      publishAt: null,
    };
    setContents((current) => [newContent, ...current]);
    setCreateOpen(false);
    setActiveFilter("all");
    setToast("새 콘텐츠 기획을 시작했어요.");
    window.setTimeout(() => setToast(""), 2800);
  };

  return (
    <div className="dashboard-page">
      <section className="dashboard-main">
        <header className="page-heading">
          <div>
            <h1>콘텐츠 운영</h1>
            <p>기획부터 발행까지 한곳에서 관리하세요.</p>
          </div>
          <Button variant="brand" icon={<Plus size={18} />} onClick={() => setCreateOpen(true)}>
            콘텐츠 만들기
          </Button>
        </header>

        <section className="status-strip" aria-label="오늘의 콘텐츠 상태">
          <button type="button" onClick={() => setActiveFilter("review")}>
            <span className="status-strip__icon status-strip__icon--brand"><Clock3 size={21} /></span>
            <span><small>검토 대기</small><strong>{reviewCount}</strong></span>
          </button>
          <button type="button" onClick={() => setActiveFilter("scheduled")}>
            <span className="status-strip__icon status-strip__icon--info"><CalendarCheck2 size={21} /></span>
            <span><small>오늘 예약</small><strong>{scheduledCount}</strong></span>
          </button>
          <button type="button" onClick={() => navigate("/trends")}>
            <span className="status-strip__icon status-strip__icon--positive"><FileCheck2 size={21} /></span>
            <span><small>수집 중</small><strong>1</strong></span>
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
            {filteredContents.length ? filteredContents.map((content) => (
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
            <span><strong>원고 검토</strong><small>{reviewCount}건</small></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="task-item" onClick={() => setActiveFilter("scheduled")}>
            <span className="task-item__icon task-item__icon--info"><CalendarCheck2 size={20} /></span>
            <span><strong>예약 확인</strong><small>{scheduledCount}건</small></span>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="task-item" onClick={() => navigate("/contents/silson-generations")}>
            <span className="task-item__icon task-item__icon--positive"><FileCheck2 size={20} /></span>
            <span><strong>자료 출처 확인</strong><small>1건</small></span>
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
        </section>
      </aside>

      <CreateContentDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      {toast ? <div className="snackbar" role="status">{toast}</div> : null}
    </div>
  );
}
