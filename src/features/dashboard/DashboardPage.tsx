import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  Filter,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
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

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contents, connectionStatus, creating, createAndRun, removeMany } = useContents();
  const requestedFilter = searchParams.get("filter");
  const activeFilter: "all" | ContentStatus = requestedFilter && filters.some((filter) => filter.key === requestedFilter)
    ? requestedFilter as ContentStatus
    : "all";
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const deletable = (content: { status: ContentStatus }) =>
    !["scheduled", "published", "deleted"].includes(content.status);

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

  const selectableContents = useMemo(
    () => filteredContents.filter(deletable),
    [filteredContents],
  );
  const allVisibleSelected = selectableContents.length > 0
    && selectableContents.every((content) => selectedIds.has(content.id));

  const stopSelectionClick = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  const handleSelectionChange = (event: ChangeEvent<HTMLInputElement>, callback: () => void) => {
    event.stopPropagation();
    callback();
  };

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => contents.some((content) => content.id === id))));
  }, [contents]);

  const reviewCount = contents.filter((content) => content.status === "review").length;
  const scheduledCount = contents.filter((content) => content.status === "scheduled").length;
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

  const toggleSelected = (contentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) selectableContents.forEach((content) => next.delete(content.id));
      else selectableContents.forEach((content) => next.add(content.id));
      return next;
    });
  };

  const removeSelected = async () => {
    const ids = [...selectedIds].filter((id) => contents.some((content) => content.id === id && deletable(content)));
    if (!ids.length || bulkDeleting) return;
    if (!window.confirm(`${ids.length}건의 콘텐츠를 영구 삭제할까요? 원문·변경 이력·생성 이미지를 복구할 수 없습니다.`)) return;
    setBulkDeleting(true);
    try {
      const result = await removeMany(ids);
      setSelectedIds(new Set());
      const mirrorPending = result.items.some((item) => item.mirrorSynced === false);
      setToast(result.failures.length
        ? `${result.items.length}건 삭제 완료, ${result.failures.length}건은 삭제하지 못했습니다.`
        : mirrorPending
          ? `${result.items.length}건을 삭제했지만 운영 DB 동기화가 지연되고 있습니다.`
          : `${result.items.length}건을 삭제했습니다.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "선택한 콘텐츠를 삭제하지 못했습니다.");
    } finally {
      setBulkDeleting(false);
      window.setTimeout(() => setToast(""), 3600);
    }
  };

  return (
    <div className="dashboard-page">
      <section className="dashboard-main">
        <header className="operations-heading">
          <Button variant="brand" icon={<Plus size={18} />} onClick={() => setCreateOpen(true)} disabled={connectionStatus !== "connected"}>
            콘텐츠 만들기
          </Button>
        </header>

        {connectionStatus === "offline" ? <div className="operations-notice" role="alert">콘텐츠를 불러오지 못했습니다. 잠시 후 새로고침해주세요.</div> : null}

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
            <span><small>전체 콘텐츠</small><strong>{connectionStatus === "connecting" ? "-" : contents.length}</strong></span>
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
          <div className="content-toolbar__actions">
            {selectedIds.size > 0 ? (
              <div className="bulk-selection">
                <span>{selectedIds.size}건 선택</span>
                <Button variant="danger" size="small" icon={<Trash2 size={16} />} onClick={() => void removeSelected()} disabled={bulkDeleting}>
                  {bulkDeleting ? "삭제 중..." : "선택 삭제"}
                </Button>
              </div>
            ) : null}
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
        </div>

        <div className="content-table" role="region" aria-label="콘텐츠 목록" tabIndex={0}>
          <div className="content-table__header" role="row">
            <span className="content-table__title-header">
              <input
                type="checkbox"
                aria-label="현재 목록에서 삭제 가능한 콘텐츠 전체 선택"
                checked={allVisibleSelected}
                onClick={stopSelectionClick}
                onChange={(event) => handleSelectionChange(event, toggleAllVisible)}
                disabled={!selectableContents.length}
              />
              콘텐츠
            </span><span>상태</span><span>담당자</span><span>업데이트</span><span>발행 예정</span><span />
          </div>
          <div className="content-table__body">
            {connectionStatus === "connecting" ? (
              <div className="content-list-loading" role="status"><span className="page-loading__spinner" aria-hidden="true" />실제 콘텐츠를 불러오는 중입니다.</div>
            ) : filteredContents.length ? filteredContents.map((content) => (
              <div
                key={content.id}
                className={`content-row ${selectedIds.has(content.id) ? "content-row--selected" : ""}`}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/contents/${content.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/contents/${content.id}`);
                  }
                }}
              >
                <span className="content-row__title">
                  <input
                    type="checkbox"
                    aria-label={`${content.title} 선택`}
                  checked={selectedIds.has(content.id)}
                  disabled={!deletable(content)}
                    onClick={stopSelectionClick}
                    onKeyDown={(event) => event.stopPropagation()}
                    onChange={(event) => handleSelectionChange(event, () => toggleSelected(content.id))}
                  />
                  <span>{content.title}</span>
                </span>
                <span><StatusBadge status={content.status} /></span>
                <span className="assignee"><span className="avatar">{content.initials}</span>{content.assignee}</span>
                <span className="content-row__meta" data-label="업데이트">{content.updatedAt}</span>
                <span className="content-row__meta" data-label="발행 예정">{content.publishAt ?? "-"}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </div>
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
