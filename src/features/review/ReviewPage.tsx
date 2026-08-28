import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  Globe2,
  Images,
  LayoutTemplate,
  SearchCheck,
  ShieldAlert,
  UserRound,
  Copy,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { contentImageUrl, generateContentImages } from "../../api/client";
import type { ApiContentVersion, ApiGeneratedImagePackage } from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import type { ContentStatus } from "../../types/content";
import { RejectDialog } from "./RejectDialog";
import { EvidenceReviewPanel, evidenceReviewFrom } from "./EvidenceReviewPanel";
import { useContentDetail } from "./useContentDetail";

type ReviewTab = "draft" | "sources" | "images" | "history";

interface VisualPlanItem {
  afterSection: number;
  purpose: "concept" | "comparison" | "checklist" | "process";
  brief: string;
  altText: string;
}

const visualPurposeLabel: Record<VisualPlanItem["purpose"], string> = {
  concept: "개념 설명",
  comparison: "비교",
  checklist: "체크리스트",
  process: "절차",
};

function visualPlanFrom(version: ApiContentVersion | null): VisualPlanItem[] {
  const value = version?.metadata.visualPlan;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const purpose = candidate.purpose;
    if (!Number.isInteger(candidate.afterSection)
      || !["concept", "comparison", "checklist", "process"].includes(String(purpose))
      || typeof candidate.brief !== "string"
      || typeof candidate.altText !== "string") return [];
    return [{
      afterSection: candidate.afterSection as number,
      purpose: purpose as VisualPlanItem["purpose"],
      brief: candidate.brief,
      altText: candidate.altText,
    }];
  });
}

function imagePackageFrom(version: ApiContentVersion | null): ApiGeneratedImagePackage | null {
  const value = version?.metadata.imagePackage;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!['ready', 'failed'].includes(String(candidate.status)) || typeof candidate.runId !== "string") return null;
  return candidate as unknown as ApiGeneratedImagePackage;
}

const pipelineStageLabel: Record<string, string> = {
  collect_trends: "트렌드 수집",
  verify_sources: "공식 근거 검증",
  create_brief: "기획서 생성",
  write_draft: "초안 작성",
  optimize_seo: "SEO 최적화",
  optimize_geo: "GEO 최적화",
  humanize_tone: "사람 말투 보정",
  quality_assurance: "품질 검사",
  notify_review: "검토 요청",
};

export function ReviewPage() {
  const navigate = useNavigate();
  const { contentId } = useParams();
  const { detail, connectionStatus, loadError, reload, refresh, approve: approveApi, reject: rejectApi } = useContentDetail(contentId);
  const [tab, setTab] = useState<ReviewTab>("draft");
  const [activeOutline, setActiveOutline] = useState("summary");
  const [expandedQuality, setExpandedQuality] = useState("");
  const [checks, setChecks] = useState({ sources: false, ads: false });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<"approve" | "reject" | null>(null);
  const [rewritePending, setRewritePending] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageRequestStartedAt, setImageRequestStartedAt] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const finalChecksRef = useRef<HTMLElement>(null);
  const firstFinalCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (detail?.content.rewriteStatus === "queued") setRewritePending(true);
  }, [detail?.content.id, detail?.content.rewriteStatus]);

  useEffect(() => {
    if (!rewritePending) return;
    let stopped = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await refresh();
        if (stopped) return;
        if (next.content.state === "review_ready") {
          setRewritePending(false);
          setToast("반려 의견을 반영한 새 버전이 완성됐어요. 다시 검토해주세요.");
          window.setTimeout(() => setToast(""), 5000);
        } else if (attempts >= 40) {
          setRewritePending(false);
          setToast("재작성 시간이 길어지고 있습니다. GitHub Actions의 Rewrite rejected draft 실행을 확인해주세요.");
          window.setTimeout(() => setToast(""), 7000);
        }
      } catch {
        if (attempts >= 40 && !stopped) setRewritePending(false);
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [refresh, rewritePending]);

  useEffect(() => {
    if (!imagePending) return;
    let stopped = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await refresh();
        if (stopped) return;
        const nextPackage = imagePackageFrom(next.versions.at(-1) ?? null);
        const packageTime = Date.parse(nextPackage?.generatedAt ?? nextPackage?.updatedAt ?? "");
        const isNewResult = imageRequestStartedAt === null || (Number.isFinite(packageTime) && packageTime >= imageRequestStartedAt - 5_000);
        if (nextPackage?.status === "ready" && isNewResult) {
          setImagePending(false);
          setImageRequestStartedAt(null);
          setTab("images");
          setToast("대표 이미지와 본문 이미지가 완성됐어요. 사용 전 미리보기를 확인해주세요.");
          window.setTimeout(() => setToast(""), 5000);
        } else if (nextPackage?.status === "failed" && isNewResult) {
          setImagePending(false);
          setImageRequestStartedAt(null);
          setTab("images");
          setToast("이미지 생성이 완료되지 않았습니다. 이미지 탭에서 다시 요청할 수 있어요.");
          window.setTimeout(() => setToast(""), 5000);
        } else if (attempts >= 40) {
          setImagePending(false);
          setToast("이미지 생성 시간이 길어지고 있습니다. GitHub Actions의 Generate approved draft images 실행을 확인해주세요.");
          window.setTimeout(() => setToast(""), 7000);
        }
      } catch {
        if (attempts >= 40 && !stopped) setImagePending(false);
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [imagePending, imageRequestStartedAt, refresh]);

  if (connectionStatus === "loading") {
    return (
      <div className="review-page">
        <header className="review-header">
          <div className="review-header__title">
            <button className="icon-button" type="button" aria-label="콘텐츠 목록으로 돌아가기" onClick={() => navigate("/contents")}><ArrowLeft size={22} /></button>
            <h1>원고를 불러오는 중입니다</h1>
          </div>
        </header>
        <div className="review-state"><PageLoadingState label="최신 원고와 검수 결과를 불러오는 중입니다." /></div>
      </div>
    );
  }

  if (connectionStatus === "offline" || !detail) {
    return (
      <div className="review-page">
        <header className="review-header">
          <div className="review-header__title">
            <button className="icon-button" type="button" aria-label="콘텐츠 목록으로 돌아가기" onClick={() => navigate("/contents")}><ArrowLeft size={22} /></button>
            <h1>원고를 표시할 수 없습니다</h1>
          </div>
        </header>
        <div className="review-state review-state--error">
          <strong>최신 원고를 불러오지 못했습니다.</strong>
          <p>{loadError || "자동화 서버 연결을 확인한 뒤 다시 시도해주세요."}</p>
          <Button variant="brand" onClick={reload}>다시 시도</Button>
        </div>
      </div>
    );
  }

  const apiState = detail.content.state;
  const status: ContentStatus = apiState === "review_ready"
      ? "review"
      : apiState === "approved"
        ? "approved"
        : apiState === "scheduled"
          ? "scheduled"
          : apiState === "published" || apiState === "measured"
            ? "published"
            : apiState === "drafting"
              ? "drafting"
              : "planning";
  const finalChecksComplete = checks.sources && checks.ads;
  const staleDetail = detail.freshness?.stale === true;
  const canRequestApproval = status === "review" && connectionStatus === "connected" && !staleDetail && decisionBusy === null;
  const currentSources = detail.sources.map((source) => ({
    organization: source.organization,
    date: source.collectedAt.slice(0, 10),
    note: source.title,
    url: /^https?:\/\//i.test(source.url) ? source.url : "",
  }));
  const latestJob = detail.jobs[0] ?? null;
  const latestVersion = detail.versions.at(-1) ?? null;
  const imagePackage = imagePackageFrom(latestVersion);
  const evidenceReview = evidenceReviewFrom(latestVersion);
  const effectiveQualityItems = detail.qualityResults.map((result) => {
        const definition = {
          facts: { label: "사실 근거", icon: CheckCircle2, tone: "positive" },
          seo: { label: "SEO 점검", icon: SearchCheck, tone: "info" },
          geo: { label: "GEO 점검", icon: Globe2, tone: "info" },
          editorial: { label: "편집 품질", icon: LayoutTemplate, tone: "positive" },
          tone: { label: "사람 말투", icon: UserRound, tone: "positive" },
          advertising: { label: "광고 위험", icon: ShieldAlert, tone: "warning" },
        }[result.category];
        return {
          id: result.category,
          label: `${definition.label} ${result.score}점`,
          status: result.status,
          icon: definition.icon,
          tone: result.status === "warning" || result.status === "failed" ? "warning" : definition.tone,
          detail: result.messages.join(" "),
        };
      });
  const failedQualityItems = effectiveQualityItems.filter((item) => item.status === "failed");
  const toneDiffSummary = Array.isArray(latestVersion?.metadata.diffSummary)
    ? latestVersion.metadata.diffSummary.filter((item): item is string => typeof item === "string")
    : [];
  const visualPlan = visualPlanFrom(latestVersion);
  const copyPackage = typeof latestVersion?.metadata.copyPackage === "string" ? latestVersion.metadata.copyPackage : latestVersion?.body ?? "";
  const jumpTo = (id: string) => {
    setActiveOutline(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const approve = async () => {
    if (!canRequestApproval) return;
    if (!finalChecksComplete) {
      finalChecksRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => firstFinalCheckRef.current?.focus(), 350);
      setToast("최종 확인 두 항목을 체크해야 승인할 수 있습니다.");
      window.setTimeout(() => setToast(""), 3200);
      return;
    }
    if (failedQualityItems.length > 0) {
      const firstFailure = failedQualityItems[0];
      setExpandedQuality(firstFailure.id);
      document.getElementById(`quality-${firstFailure.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setToast(`자동 검수 실패 ${failedQualityItems.length}건을 먼저 보완해야 승인할 수 있습니다.`);
      window.setTimeout(() => setToast(""), 4200);
      return;
    }
    setDecisionBusy("approve");
    try {
      const updated = await approveApi({ sources: checks.sources, advertising: checks.ads });
      if (updated?.imagesQueued === true) {
        setImageRequestStartedAt(Date.now());
        setImagePending(true);
      }
      setToast(updated?.imagesQueued === false
        ? "원고는 승인됐지만 이미지 생성 요청에 실패했습니다. 이미지 탭에서 다시 요청해주세요."
        : updated?.mirrorSynced === false
        ? "승인은 저장됐지만 운영 DB 동기화가 지연되고 있습니다. 잠시 후 다시 열어 확인해주세요."
        : "원고를 승인하고 이미지 생성을 시작했어요. 완료되면 이미지 탭으로 이동합니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "승인 처리에 실패했습니다.");
    } finally {
      setDecisionBusy(null);
    }
    window.setTimeout(() => setToast(""), 3200);
  };

  const generateImages = async () => {
    if (!contentId || imageBusy) return;
    setImageBusy(true);
    try {
      setImageRequestStartedAt(Date.now());
      await generateContentImages(contentId);
      setImagePending(true);
      setToast("이미지 생성을 요청했어요. 완료되면 자동으로 새 결과를 불러옵니다.");
    } catch (error) {
      setImageRequestStartedAt(null);
      setToast(error instanceof Error ? error.message : "이미지 생성 요청에 실패했습니다.");
    } finally {
      setImageBusy(false);
      window.setTimeout(() => setToast(""), 4200);
    }
  };

  const reject = async (reason: string) => {
    if (decisionBusy !== null) return;
    setDecisionBusy("reject");
    try {
      const updated = await rejectApi(reason);
      setRejectOpen(false);
      setRewritePending(updated?.rewriteQueued === true);
      if (updated?.rewriteQueued === false) {
        setToast("반려는 저장됐지만 자동 재작성 요청에 실패했습니다. GitHub Actions에서 Rewrite rejected draft를 수동 실행해주세요.");
      } else if (updated?.mirrorSynced === false) {
        setToast("반려 의견을 저장하고 자동 재작성을 시작했어요. 운영 DB는 다음 조회에서 다시 동기화합니다.");
      } else if (updated?.rewriteQueued === true) {
        setToast("반려 의견을 저장하고 자동 재작성을 시작했어요. 완료되면 다시 검토 필요 상태로 돌아옵니다.");
      } else {
        setToast("반려 의견을 저장했어요.");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "반려 처리에 실패했습니다.");
      throw error;
    } finally {
      setDecisionBusy(null);
      window.setTimeout(() => setToast(""), 3600);
    }
  };

  return (
    <div className="review-page">
      <header className="review-header">
        <div className="review-header__title">
          <button className="icon-button" type="button" aria-label="콘텐츠 목록으로 돌아가기" onClick={() => navigate("/contents")}>
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1>{detail.content.title}</h1>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="review-header__actions">
          <Button icon={<Copy size={17} />} disabled={!copyPackage.trim()} onClick={() => {
            void navigator.clipboard.writeText(copyPackage).then(() => {
              setToast("네이버 블로그에 붙여넣을 원고를 복사했습니다.");
              window.setTimeout(() => setToast(""), 3200);
            });
          }}>원고 복사</Button>
          <Button onClick={() => setRejectOpen(true)} disabled={status !== "review" || connectionStatus !== "connected" || staleDetail || decisionBusy !== null}>반려</Button>
          <Button variant="brand" onClick={approve} disabled={!canRequestApproval} icon={status === "approved" ? <Check size={18} /> : undefined}>
            {status === "approved" ? "승인 완료" : decisionBusy === "approve" ? "승인 처리 중" : "승인하기"}
          </Button>
        </div>
      </header>

      <div className="review-workspace">
        <aside className="document-outline" aria-label="문서 구성">
          <strong>문서 구성</strong>
          {[
            ["summary", "핵심 요약"],
            ["differences", "주요 내용"],
            ["before-switch", "점검 기준"],
            ["faq", "자주 묻는 질문"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={activeOutline === id ? "document-outline__active" : ""} onClick={() => jumpTo(id)}>
              <span />{label}
            </button>
          ))}
        </aside>

        <section className="editor-region">
          <div className="editor-tabs" role="tablist" aria-label="원고 정보">
            <button type="button" role="tab" aria-selected={tab === "draft"} onClick={() => setTab("draft")}>원고</button>
            <button type="button" role="tab" aria-selected={tab === "sources"} onClick={() => setTab("sources")}>근거</button>
            <button type="button" role="tab" aria-selected={tab === "images"} onClick={() => setTab("images")}>이미지</button>
            <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>변경 이력</button>
          </div>

          {tab === "draft" ? <ArticleDraft title={latestVersion?.title} body={latestVersion?.body} /> : null}
          {tab === "sources" ? <EvidenceReviewPanel evidence={evidenceReview} sources={detail.sources} claims={detail.claims} /> : null}
          {tab === "images" ? <ImageAssetsView contentId={detail.content.id} packageState={imagePackage} contentStatus={status} pending={imagePending} busy={imageBusy} onGenerate={() => void generateImages()} /> : null}
          {tab === "history" ? <HistoryView versions={detail.versions} /> : null}
        </section>

        <aside className="quality-inspector">
          <h2>검수 결과</h2>
          <div className={`review-connection review-connection--${staleDetail ? "offline" : connectionStatus}`} role={staleDetail ? "alert" : undefined}>
            <span />
            {staleDetail ? "최신 GitHub 조회 실패 · 저장된 원고는 승인하거나 반려할 수 없음" : "최신 원고와 자동화 실행 기록 연결됨"}
          </div>
          <section className="inspector-section final-checks final-checks--priority" ref={finalChecksRef}>
            <h3>최종 승인 확인</h3>
            <label>
              <input ref={firstFinalCheckRef} type="checkbox" checked={checks.sources} onChange={(event) => setChecks((current) => ({ ...current, sources: event.target.checked }))} />
              <span>수치와 출처를 확인했어요</span>
            </label>
            <label>
              <input type="checkbox" checked={checks.ads} onChange={(event) => setChecks((current) => ({ ...current, ads: event.target.checked }))} />
              <span>광고성 표현을 확인했어요</span>
            </label>
            {!finalChecksComplete && status === "review" ? <p>실제 승인 처리는 두 항목을 모두 확인한 뒤 가능합니다.</p> : null}
            {failedQualityItems.length > 0 && status === "review" ? (
              <p role="alert">자동 검수 실패 {failedQualityItems.length}건을 보완한 뒤 승인할 수 있습니다.</p>
            ) : null}
          </section>
          {latestJob ? (
            <section className="pipeline-progress" aria-label="자동화 단계">
              <header><strong>자동화 단계</strong><small>{latestJob.steps.filter((step) => step.status === "succeeded").length}/{latestJob.steps.length}</small></header>
              <ol>
                {latestJob.steps.map((step) => (
                  <li key={step.stage} className={`pipeline-progress__${step.status}`}>
                    <span>{step.status === "succeeded" ? <Check size={13} /> : null}</span>
                    {pipelineStageLabel[step.stage] ?? step.stage}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <div className="quality-list">
            {effectiveQualityItems.map(({ id, label, tone, icon: Icon, detail: qualityDetail }) => {
              const expanded = expandedQuality === id;
              return (
                <div className="quality-item" id={`quality-${id}`} key={id}>
                  <button type="button" aria-expanded={expanded} onClick={() => setExpandedQuality(expanded ? "" : id)}>
                    <Icon className={`quality-icon quality-icon--${tone}`} size={20} />
                    <span>{label}</span>
                    <ChevronDown className={expanded ? "chevron--open" : ""} size={17} />
                  </button>
                  {expanded ? <p>{qualityDetail}</p> : null}
                </div>
              );
            })}
            {!effectiveQualityItems.length ? <p className="review-empty-inline">저장된 품질 검사 결과가 없습니다.</p> : null}
          </div>

          <section className="inspector-section">
            <h3>말투 보정 변경</h3>
            <div className="diff-card">
              {toneDiffSummary.length ? (
                <div className="diff-extra">
                  {toneDiffSummary.map((summary) => <p key={summary}>{summary}</p>)}
                </div>
              ) : (
                <p className="review-empty-inline">저장된 말투 보정 변경 요약이 없습니다.</p>
              )}
            </div>
          </section>

          <section className="inspector-section">
            <h3>시각 자료 계획</h3>
            {visualPlan.length ? (
              <ol className="visual-plan-list">
                {visualPlan.map((visual, index) => (
                  <li key={`${visual.afterSection}-${visual.purpose}-${index}`}>
                    <span><Images size={16} />{visualPurposeLabel[visual.purpose]} · 본문 {visual.afterSection}절 뒤</span>
                    <p>{visual.brief}</p>
                    <small>대체 텍스트: {visual.altText}</small>
                  </li>
                ))}
              </ol>
            ) : <p className="review-empty-inline">저장된 시각 자료 계획이 없습니다.</p>}
          </section>

          <section className="inspector-section">
            <h3>출처</h3>
            <div className="source-list">
              {currentSources.map((source) => (
                <button type="button" key={`${source.organization}-${source.url}`} title={source.note} onClick={() => source.url && window.open(source.url, "_blank", "noopener,noreferrer")}>
                  <span><FileCheck2 size={16} />{source.organization}</span>
                  <small>{source.date}</small>
                  <ExternalLink size={15} />
                </button>
              ))}
              {!currentSources.length ? <p className="review-empty-inline">저장된 출처가 없습니다.</p> : null}
            </div>
          </section>

        </aside>
      </div>

      <RejectDialog open={rejectOpen} busy={decisionBusy !== null} onClose={() => setRejectOpen(false)} onReject={reject} />
      {toast ? <div className="snackbar" role="status">{toast}</div> : null}
    </div>
  );
}

function ImageAssetsView({
  contentId,
  packageState,
  contentStatus,
  pending,
  busy,
  onGenerate,
}: {
  contentId: string;
  packageState: ApiGeneratedImagePackage | null;
  contentStatus: ContentStatus;
  pending: boolean;
  busy: boolean;
  onGenerate: () => void;
}) {
  const assets = packageState?.assets ?? [];
  const canGenerate = ["approved", "scheduled", "published"].includes(contentStatus);
  const ready = packageState?.status === "ready" && packageState.technicalQualityPassed === true && assets.length > 0;
  return (
    <section className="image-assets" aria-label="생성 이미지">
      <header className="image-assets__header">
        <div>
          <h2>블로그 이미지</h2>
          <p>전달한 우수 샘플의 구도와 완성도를 참고해 대표 1장과 본문 2장을 실사 또는 고급 일러스트로 만듭니다.</p>
        </div>
        {canGenerate ? (
          <Button variant={ready ? "outline" : "brand"} disabled={pending || busy} icon={<Images size={17} />} onClick={onGenerate}>
            {pending ? "생성 중" : busy ? "요청 중" : ready ? "다시 생성" : "이미지 생성"}
          </Button>
        ) : null}
      </header>

      {pending ? (
        <div className="image-assets__state"><PageLoadingState label="고품질 대표 이미지와 본문 이미지를 생성하는 중입니다." /></div>
      ) : ready ? (
        <>
          <div className="image-assets__grid">
            {assets.map((asset) => (
              <figure className={asset.role === "hero" ? "image-asset image-asset--hero" : "image-asset"} key={asset.id}>
                <img src={contentImageUrl(contentId, asset.id, packageState.generatedAt)} alt={asset.altText} loading="lazy" />
                <figcaption>
                  <div><strong>{asset.role === "hero" ? "대표 이미지" : `본문 ${asset.afterSection}절 뒤`}</strong><span>AI 실사·일러스트</span></div>
                  <p>{asset.altText}</p>
                  <small>{asset.width}×{asset.height} · {Math.round(asset.bytes / 1024)}KB</small>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="image-assets__checks">
            <strong>자동 품질 검사</strong>
            {(packageState.checks ?? []).map((check) => <span key={check.id} className={check.passed ? "passed" : "failed"}><CheckCircle2 size={16} />{check.label} · {check.detail}</span>)}
            <span className={packageState.visualQuality?.overallPassed ? "passed" : "failed"}><CheckCircle2 size={16} />AI 시각 품질 검사 · {packageState.visualQuality?.overallPassed ? "통과" : "확인 필요"}</span>
            <p>{packageState.visualQuality?.summary ?? "해상도·비율·용량 기준을 통과했습니다."} 최종 사용 전에는 사람·손·차량 디테일과 주제 적합성을 눈으로 한 번 더 확인해주세요.</p>
          </div>
        </>
      ) : packageState?.status === "failed" ? (
        <div className="image-assets__state image-assets__state--failed">
          <strong>이미지 생성이 완료되지 않았습니다.</strong>
          <p>{packageState.message ?? "GitHub Actions 실행 기록을 확인하거나 다시 생성해주세요."}</p>
        </div>
      ) : (
        <div className="image-assets__state">
          <strong>{canGenerate ? "아직 생성된 이미지가 없습니다." : "원고 승인 후 이미지를 생성합니다."}</strong>
          <p>{canGenerate ? "이미지 생성을 누르면 대표 이미지 1장과 본문 이미지 2장을 만듭니다." : "원고 내용이 확정된 뒤에만 생성해 사용 한도와 재작업을 줄입니다."}</p>
        </div>
      )}
    </section>
  );
}

function renderGeneratedBlocks(body: string): ReactNode[] {
  let sectionIndex = 0;
  const sectionIds = ["summary", "differences", "before-switch", "faq"];
  return body.split("\n\n").flatMap((block, index) => {
    const text = block.trim();
    if (!text) return [];
    if (text.startsWith("### ")) return [<h4 key={index}>{renderInlineBold(text.slice(4), `h4-${index}`)}</h4>];
    if (text.startsWith("## ")) {
      const id = sectionIds[Math.min(sectionIndex++, sectionIds.length - 1)];
      return [<h3 id={id} key={index}>{renderInlineBold(text.slice(3), `h3-${index}`)}</h3>];
    }
    if (text.startsWith("# ")) return [<h2 id="summary" key={index}>{renderInlineBold(text.slice(2), `h2-${index}`)}</h2>];
    if (text.startsWith("- ")) {
      return [<ul key={index}>{text.split("\n").map((line, lineIndex) => <li key={`${lineIndex}-${line}`}>{renderInlineBold(line.replace(/^-\s*/, ""), `li-${index}-${lineIndex}`)}</li>)}</ul>];
    }
    if (text.startsWith("> ")) return [<p className="article-note" key={index}>{renderInlineBold(text.slice(2), `note-${index}`)}</p>];
    return [<p key={index}>{renderInlineBold(text, `p-${index}`)}</p>];
  });
}

const inlineBoldPattern = /(\*\*[^*]+\*\*)/g;

function renderInlineBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(inlineBoldPattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    return part.startsWith("**") && part.endsWith("**")
      ? <strong key={key}>{part.slice(2, -2)}</strong>
      : <Fragment key={key}>{part}</Fragment>;
  });
}

function ArticleDraft({ title, body }: { title?: string; body?: string }) {
  if (!body?.trim()) return <div className="review-content-empty">저장된 원고 본문이 없습니다.</div>;
  return <article className="article-draft article-draft--generated" aria-label={`${title ?? "생성된 원고"} 본문`}>{renderGeneratedBlocks(body)}</article>;
}

function HistoryView({ versions }: { versions: ApiContentVersion[] }) {
  const historyItems = [...versions].reverse().map((version) => [
        `v${version.sequence}`,
        { human_tone: "사람 말투 보정", geo: "GEO 편집", seo: "SEO 편집", draft: "초안 생성", brief: "기획서 생성", manual: "사람 수정" }[version.stage],
        version.stage === "human_tone" ? "skill runner" : "자동화 작업",
        new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(version.createdAt)),
      ]);
  return (
    <div className="history-view">
      <header><h2>변경 이력</h2><p>각 자동화 단계가 만든 버전을 시간순으로 확인할 수 있어요.</p></header>
      {historyItems.map(([version, title, actor, time]) => (
        <section key={version}><span>{version}</span><div><h3>{title}</h3><p>{actor}</p></div><time>{time}</time></section>
      ))}
      {!historyItems.length ? <div className="review-content-empty">저장된 변경 이력이 없습니다.</div> : null}
    </div>
  );
}
