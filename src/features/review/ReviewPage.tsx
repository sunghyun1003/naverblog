import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  Globe2,
  SearchCheck,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { RejectDialog } from "./RejectDialog";

type ReviewTab = "draft" | "sources" | "history";

const qualityItems = [
  { id: "facts", label: "사실 근거 8/8 확인", tone: "positive", icon: CheckCircle2, detail: "수치와 제도 설명이 연결된 출처 3곳과 일치합니다." },
  { id: "seo", label: "SEO 점검 완료", tone: "info", icon: SearchCheck, detail: "제목과 본문이 검색 의도에 맞고 키워드 반복이 감지되지 않았습니다." },
  { id: "geo", label: "GEO 점검 완료", tone: "info", icon: Globe2, detail: "직접 답변, 기준일, 출처, FAQ 구조가 포함됐습니다." },
  { id: "tone", label: "사람 말투 보정 적용", tone: "positive", icon: UserRound, detail: "human-tone skill v1.2가 적용됐고 보호된 수치는 변경되지 않았습니다." },
  { id: "risk", label: "광고 위험 검토 필요", tone: "warning", icon: ShieldAlert, detail: "특정 상품 권유는 없지만 비교 표현을 사람이 최종 확인해야 합니다." },
];

const sources = [
  { organization: "금융위원회", date: "2026.07.18", note: "실손보험 제도 안내" },
  { organization: "금융감독원", date: "2026.06.30", note: "소비자 유의사항" },
  { organization: "보험개발원", date: "2026.05.12", note: "세대별 구조 참고" },
];

export function ReviewPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ReviewTab>("draft");
  const [activeOutline, setActiveOutline] = useState("summary");
  const [expandedQuality, setExpandedQuality] = useState("risk");
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [checks, setChecks] = useState({ sources: false, ads: false });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [status, setStatus] = useState<"review" | "scheduled">("review");
  const [toast, setToast] = useState("");

  const canApprove = checks.sources && checks.ads && status === "review";
  const jumpTo = (id: string) => {
    setActiveOutline(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const approve = () => {
    if (!canApprove) return;
    setStatus("scheduled");
    setToast("원고를 승인했어요. 발행 일정에서 예약할 수 있습니다.");
    window.setTimeout(() => setToast(""), 3200);
  };

  const reject = (reason: string) => {
    setRejectOpen(false);
    setToast(`반려 사유가 담당자에게 전달됐어요: ${reason}`);
    window.setTimeout(() => setToast(""), 3600);
  };

  return (
    <div className="review-page">
      <header className="review-header">
        <div className="review-header__title">
          <button className="icon-button" type="button" aria-label="콘텐츠 목록으로 돌아가기" onClick={() => navigate("/contents")}>
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1>실손보험 세대별 차이, 무엇이 달라졌을까?</h1>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="review-header__actions">
          <Button onClick={() => setRejectOpen(true)} disabled={status !== "review"}>반려</Button>
          <Button variant="brand" onClick={approve} disabled={!canApprove} icon={status === "scheduled" ? <Check size={18} /> : undefined}>
            {status === "scheduled" ? "승인 완료" : "승인하기"}
          </Button>
        </div>
      </header>

      <div className="review-workspace">
        <aside className="document-outline" aria-label="문서 구성">
          <strong>문서 구성</strong>
          {[
            ["summary", "핵심 요약"],
            ["differences", "세대별 차이"],
            ["before-switch", "전환 전 확인"],
            ["faq", "자주 묻는 질문"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={activeOutline === id ? "document-outline__active" : ""} onClick={() => jumpTo(id)}>
              <span />{label}
            </button>
          ))}
        </aside>

        <section className="editor-region">
          <div className="editor-tabs" role="tablist" aria-label="원고 정보">
            <button role="tab" aria-selected={tab === "draft"} onClick={() => setTab("draft")}>원고</button>
            <button role="tab" aria-selected={tab === "sources"} onClick={() => setTab("sources")}>근거</button>
            <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>변경 이력</button>
          </div>

          {tab === "draft" ? <ArticleDraft /> : null}
          {tab === "sources" ? <EvidenceView /> : null}
          {tab === "history" ? <HistoryView /> : null}
        </section>

        <aside className="quality-inspector">
          <h2>검수 결과</h2>
          <div className="quality-list">
            {qualityItems.map(({ id, label, tone, icon: Icon, detail }) => {
              const expanded = expandedQuality === id;
              return (
                <div className="quality-item" key={id}>
                  <button type="button" aria-expanded={expanded} onClick={() => setExpandedQuality(expanded ? "" : id)}>
                    <Icon className={`quality-icon quality-icon--${tone}`} size={20} />
                    <span>{label}</span>
                    <ChevronDown className={expanded ? "chevron--open" : ""} size={17} />
                  </button>
                  {expanded ? <p>{detail}</p> : null}
                </div>
              );
            })}
          </div>

          <section className="inspector-section">
            <h3>말투 보정 변경</h3>
            <div className="diff-card">
              <div className="diff-columns">
                <div><small>변경 전</small><p>4세대 실손은 <del>무조건 혜택이 많습니다.</del></p></div>
                <span aria-hidden="true">→</span>
                <div><small>변경 후</small><p>4세대 실손은 <ins>이용 형태에 따라 유불리가 달라질 수 있어요.</ins></p></div>
              </div>
              {diffExpanded ? (
                <div className="diff-extra">
                  <p><del>꼭 전환해야 합니다.</del></p>
                  <p><ins>보장 범위와 보험료를 비교한 뒤 판단하세요.</ins></p>
                </div>
              ) : null}
              <button type="button" onClick={() => setDiffExpanded((current) => !current)}>
                {diffExpanded ? "변경 내용 접기" : "변경 내용 보기"}
              </button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>출처</h3>
            <div className="source-list">
              {sources.map((source) => (
                <button type="button" key={source.organization} title={source.note}>
                  <span><FileCheck2 size={16} />{source.organization}</span>
                  <small>{source.date}</small>
                  <ExternalLink size={15} />
                </button>
              ))}
            </div>
          </section>

          <section className="inspector-section final-checks">
            <h3>최종 확인</h3>
            <label>
              <input type="checkbox" checked={checks.sources} onChange={(event) => setChecks((current) => ({ ...current, sources: event.target.checked }))} />
              <span>수치와 출처를 확인했어요</span>
            </label>
            <label>
              <input type="checkbox" checked={checks.ads} onChange={(event) => setChecks((current) => ({ ...current, ads: event.target.checked }))} />
              <span>광고성 표현을 확인했어요</span>
            </label>
            {!canApprove && status === "review" ? <p>두 항목을 확인하면 승인할 수 있어요.</p> : null}
          </section>
        </aside>
      </div>

      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onReject={reject} />
      {toast ? <div className="snackbar" role="status">{toast}</div> : null}
    </div>
  );
}

function ArticleDraft() {
  return (
    <article className="article-draft">
      <section id="summary">
        <h2>실손보험은 가입 시기에 따라 보장 구조가 달라요</h2>
        <p>실손보험은 제도가 바뀔 때마다 자기부담금과 비급여 보장 방식이 달라졌어요. 그래서 가입 시기만 확인해도 내 계약의 큰 특징을 이해할 수 있습니다.</p>
        <p>전환이 누구에게나 유리한 것은 아닙니다. 현재 건강 상태와 의료 이용 빈도, 보험료 수준을 함께 비교해야 해요.</p>
      </section>

      <section id="differences">
        <h3>세대별 주요 차이 한눈에 보기</h3>
        <div className="comparison-table" role="region" aria-label="실손보험 세대별 구조 예시" tabIndex={0}>
          <table>
            <thead><tr><th>구분</th><th>1세대</th><th>2세대</th><th>3세대</th><th>4세대</th></tr></thead>
            <tbody>
              <tr><th>가입 시기</th><td>2009년 이전</td><td>2009~2017년</td><td>2017~2021년</td><td>2021년 이후</td></tr>
              <tr><th>자기부담</th><td>상품별 차이</td><td>일부 부담</td><td>급여·비급여 구분</td><td>이용량 반영</td></tr>
              <tr><th>확인할 점</th><td>보장 범위</td><td>갱신 조건</td><td>특약 구성</td><td>비급여 이용</td></tr>
            </tbody>
          </table>
        </div>
        <p className="article-note">※ 위 표는 구조를 이해하기 위한 요약입니다. 실제 조건은 가입한 보험의 약관과 상품설명서를 확인해야 합니다. <a href="#sources">[1]</a></p>
      </section>

      <section id="before-switch">
        <h3>전환을 고려하기 전에 확인하세요</h3>
        <ul>
          <li>현재 건강 상태와 과거 병력을 확인하세요.</li>
          <li>전환 전 보장 공백이 발생하지 않는지 살펴보세요.</li>
          <li>보험료뿐 아니라 자기부담과 보장 범위를 함께 비교하세요. <a href="#sources">[2]</a></li>
        </ul>
      </section>

      <section id="faq">
        <h3>자주 묻는 질문</h3>
        <h4>Q. 4세대 실손보험으로 꼭 전환해야 하나요?</h4>
        <p><strong>A.</strong> 모든 사람에게 유리하다고 단정할 수 없습니다. 의료 이용 빈도와 병력, 보험료 수준을 종합적으로 고려해 결정하는 것이 좋아요.</p>
      </section>
    </article>
  );
}

function EvidenceView() {
  return (
    <div className="evidence-view" id="sources">
      <header><h2>근거와 주장 연결</h2><p>원고의 중요한 사실 문장이 어떤 공식 자료에 근거하는지 확인하세요.</p></header>
      {sources.map((source, index) => (
        <section key={source.organization}>
          <span className="evidence-index">{index + 1}</span>
          <div><h3>{source.organization} · {source.note}</h3><p>수집일 {source.date} · 공식 자료 · 검증 완료</p><blockquote>가입 시기와 제도 변경에 따라 보장 범위와 자기부담 구조가 달라질 수 있습니다.</blockquote></div>
        </section>
      ))}
    </div>
  );
}

function HistoryView() {
  return (
    <div className="history-view">
      <header><h2>변경 이력</h2><p>각 자동화 단계가 만든 버전을 시간순으로 확인할 수 있어요.</p></header>
      {[
        ["v5", "사람 말투 보정", "human-tone skill v1.2", "10분 전"],
        ["v4", "SEO·GEO 편집", "콘텐츠 품질 작업", "18분 전"],
        ["v3", "초안 생성", "작성 작업", "24분 전"],
        ["v2", "근거 검증", "공식 출처 3개", "31분 전"],
        ["v1", "기획서 생성", "김서연", "42분 전"],
      ].map(([version, title, actor, time]) => (
        <section key={version}><span>{version}</span><div><h3>{title}</h3><p>{actor}</p></div><time>{time}</time></section>
      ))}
    </div>
  );
}
