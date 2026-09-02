import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Code2,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  Globe2,
  Images,
  LayoutTemplate,
  Languages,
  Pencil,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  Trash2,
  UserRound,
  Copy,
} from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { contentImageUrl, generateContentImages, getContentCopyAssets } from "../../api/client";
import type { ApiContent, ApiContentVersion, ApiGeneratedImagePackage } from "../../api/types";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import type { ContentStatus } from "../../types/content";
import { RejectDialog } from "./RejectDialog";
import { EditContentDialog } from "./EditContentDialog";
import { EvidenceReviewPanel, evidenceReviewFrom } from "./EvidenceReviewPanel";
import { useContentDetail } from "./useContentDetail";

type ReviewTab = "draft" | "sources" | "images" | "history";

interface VisualPlanItem {
  afterSection: number;
  purpose: "concept" | "comparison" | "checklist" | "process";
  brief: string;
  altText: string;
}

interface NativeKoreanQuality {
  status: "passed" | "warning" | "failed";
  score: number;
  counts: { high: number; medium: number; low: number };
  issues: Array<{
    id: string;
    path: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    category: string;
    excerpt: string;
    feedback: string;
    suggestedDirection: string;
    rewriteExample?: string;
  }>;
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
  if (!['queued', 'ready', 'failed'].includes(String(candidate.status)) || typeof candidate.runId !== "string") return null;
  return candidate as unknown as ApiGeneratedImagePackage;
}

/** Only a package that passed both gates can safely provide image URLs. */
function isReadyImagePackage(value: ApiGeneratedImagePackage | null | undefined): value is ApiGeneratedImagePackage {
  return value?.status === "ready"
    && value.technicalQualityPassed === true
    && value.visualQualityPassed === true
    && Array.isArray(value.assets)
    && value.assets.length > 0;
}

function queuedImagePackage(content: ApiContent): ApiGeneratedImagePackage | null {
  if (content.imageGenerationStatus !== "queued") return null;
  return {
    schemaVersion: 1,
    status: "queued",
    runId: content.id,
    assets: [],
  };
}

function nativeKoreanQualityFrom(version: ApiContentVersion | null): NativeKoreanQuality | null {
  const value = version?.metadata.nativeKoreanQuality;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<NativeKoreanQuality>;
  if (!candidate.counts || !Array.isArray(candidate.issues) || !["passed", "warning", "failed"].includes(String(candidate.status))) return null;
  return candidate as NativeKoreanQuality;
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
  const { detail, connectionStatus, loadError, reload, refresh, reject: rejectApi, resumeTone: resumeToneApi, edit: editApi, remove: removeApi } = useContentDetail(contentId);
  const [tab, setTab] = useState<ReviewTab>("draft");
  const [activeOutline, setActiveOutline] = useState("summary");
  const [expandedQuality, setExpandedQuality] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<"reject" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [rewritePending, setRewritePending] = useState(false);
  const [toneResumeBusy, setToneResumeBusy] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageRequestStartedAt, setImageRequestStartedAt] = useState<number | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [toast, setToast] = useState("");
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
        if (next.content.state === "review_ready" || next.content.state === "approved") {
          setRewritePending(false);
          setToast("수정 의견을 반영한 새 버전이 완성됐어요.");
          window.setTimeout(() => setToast(""), 5000);
        } else if (attempts >= 40) {
          setRewritePending(false);
          setToast("재작성 시간이 길어지고 있습니다. 실행 이력에서 원고 수정 작업을 확인해주세요.");
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
          setToast("이미지 생성 시간이 길어지고 있습니다. 실행 이력에서 이미지 생성 작업을 확인해주세요.");
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

  // Automatic generation starts in a separate Actions job. Keep the detail
  // view in sync while that job is queued so users do not mistake the empty
  // image tab for a missing package.
  useEffect(() => {
    if (imagePending || detail?.content.imageGenerationStatus !== "queued") return;
    let stopped = false;
    let attempts = 0;
    let timer: number | null = null;
    const poll = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const next = await refresh();
        if (stopped) return;
        if (next.content.imageGenerationStatus !== "queued") {
          setTab("images");
          setToast("이미지 생성 결과가 반영되었습니다.");
          window.setTimeout(() => setToast(""), 4200);
        } else if (attempts >= 40) {
          if (timer !== null) window.clearInterval(timer);
          setToast("이미지 생성이 아직 진행 중입니다. 잠시 후 새로고침해주세요.");
          window.setTimeout(() => setToast(""), 5000);
        }
      } catch {
        // A transient GitHub read failure should not interrupt the poll loop.
      }
    };
    void poll();
    timer = window.setInterval(() => void poll(), 15_000);
    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [detail?.content.imageGenerationStatus, imagePending, refresh]);

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
  const status: ContentStatus = apiState === "review_ready" || apiState === "approved"
      ? "ready"
      : apiState === "deleted"
        ? "deleted"
        : apiState === "scheduled"
          ? "scheduled"
          : apiState === "published" || apiState === "measured"
            ? "published"
            : apiState === "drafting"
              ? "drafting"
              : "drafting";
  const staleDetail = detail.freshness?.stale === true;
  const latestJob = detail.jobs[0] ?? null;
  const autoReady = detail.automation?.autoApproved === true && detail.automation.reviewStatus === "approved";
  const pipelineBusy = ["queued", "running"].includes(latestJob?.status ?? "")
    || detail.content.rewriteStatus === "queued";
  // A failed quality run is still actionable: the reviewer should be able to
  // reject it and trigger a rewrite instead of being trapped on this page.
  const canReject = (autoReady || status === "ready" || status === "drafting")
    && connectionStatus === "connected"
    && !staleDetail
    && !pipelineBusy
    && decisionBusy === null;
  const currentSources = detail.sources.map((source) => ({
    organization: source.organization,
    date: source.collectedAt.slice(0, 10),
    note: source.title,
    url: /^https?:\/\//i.test(source.url) ? source.url : "",
  }));
  const latestVersion = detail.versions.at(-1) ?? null;
  const imagePackage = imagePackageFrom(latestVersion) ?? queuedImagePackage(detail.content);
  const renderableImagePackage = isReadyImagePackage(imagePackage) ? imagePackage : null;
  const imageGenerationFailed = imagePackage?.status === "failed" || detail.content.imageGenerationStatus === "failed";
  const imageGenerationReady = isReadyImagePackage(imagePackage);
  const imageGenerationQueued = imagePackage?.status === "queued";
  const evidenceReview = evidenceReviewFrom(latestVersion);
  const effectiveQualityItems = detail.qualityResults.map((result) => {
        const definition = {
          facts: { label: "사실 근거", icon: CheckCircle2, tone: "positive" },
          seo: { label: "SEO 점검", icon: SearchCheck, tone: "info" },
          geo: { label: "GEO 점검", icon: Globe2, tone: "info" },
          editorial: { label: "편집 품질", icon: LayoutTemplate, tone: "positive" },
          tone: { label: "사람 말투", icon: UserRound, tone: "positive" },
          native_korean: { label: "한국어 자연스러움", icon: Languages, tone: "positive" },
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
  const toneResumeAvailable = failedQualityItems.some((item) => item.id === "tone")
    && detail.content.rewriteStatus !== "queued"
    && status !== "deleted"
    && status !== "scheduled"
    && status !== "published";
  const toneDiffSummary = Array.isArray(latestVersion?.metadata.diffSummary)
    ? latestVersion.metadata.diffSummary.filter((item): item is string => typeof item === "string")
    : [];
  const visualPlan = visualPlanFrom(latestVersion);
  const nativeKoreanQuality = nativeKoreanQualityFrom(latestVersion);
  const copyPackage = typeof latestVersion?.metadata.copyPackage === "string" ? latestVersion.metadata.copyPackage : latestVersion?.body ?? "";
  const storedCopyHtml = detail.automation?.manualEdit ? "" : typeof latestVersion?.metadata.copyPackageHtml === "string" ? latestVersion.metadata.copyPackageHtml : "";
  const hasCopyContent = Boolean(storedCopyHtml.trim() || latestVersion?.body?.trim());
  const prepareCopyHtml = async () => {
    const response = await getContentCopyAssets(detail.content.id);
    const imageUrls = Object.fromEntries(response.items.map((item) => [item.assetId, item.url]));
    return buildCopyHtml(storedCopyHtml, latestVersion?.title ?? detail.content.title, latestVersion?.body ?? "", detail.content.id, renderableImagePackage, imageUrls);
  };
  const copySource = async () => {
    setCopyBusy(true);
    try {
      await copyHtmlSource(await prepareCopyHtml(), setToast);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "HTML 소스 복사에 실패했습니다.");
    } finally {
      setCopyBusy(false);
    }
  };
  const copyWithImages = async () => {
    setCopyBusy(true);
    try {
      await copyRichContent(await prepareCopyHtml(), copyPackage, setToast);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "이미지 포함 복사에 실패했습니다.");
    } finally {
      setCopyBusy(false);
    }
  };
  const jumpTo = (id: string) => {
    setActiveOutline(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const generateImages = async (assetId?: string, feedback?: string) => {
    if (!contentId || imageBusy) return;
    setImageBusy(true);
    try {
      setImageRequestStartedAt(Date.now());
      await generateContentImages(contentId, assetId || feedback ? { assetId, feedback } : undefined);
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
        setToast("수정 의견은 저장됐지만 자동 재작성 요청에 실패했습니다. 실행 이력에서 원고 수정 작업을 다시 실행해주세요.");
      } else if (updated?.mirrorSynced === false) {
        setToast("반려 의견을 저장하고 자동 재작성을 시작했어요. 운영 DB는 다음 조회에서 다시 동기화합니다.");
      } else if (updated?.rewriteQueued === true) {
        setToast("수정 의견을 저장하고 자동 재작성을 시작했어요. 완료되면 다시 완성 상태로 돌아옵니다.");
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

  const resumeTone = async () => {
    if (!toneResumeAvailable || toneResumeBusy) return;
    setToneResumeBusy(true);
    try {
      const updated = await resumeToneApi();
      setRewritePending(updated?.rewriteQueued === true);
      setToast("저장된 원고와 말투 피드백만 다시 검사하도록 요청했습니다. 새 원고를 처음부터 만들지 않습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "저장 원고 재시도를 시작하지 못했습니다.");
    } finally {
      setToneResumeBusy(false);
      window.setTimeout(() => setToast(""), 5200);
    }
  };

  const saveEdit = async (input: { title: string; body: string; reason: string | null }) => {
    setEditBusy(true);
    try {
      await editApi(input);
      await refresh();
      setEditOpen(false);
      setToast("수정본을 새 버전으로 저장했어요. 다시 작성 중 상태에서 처리합니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "원고 수정에 실패했습니다.");
      throw error;
    } finally {
      setEditBusy(false);
      window.setTimeout(() => setToast(""), 3600);
    }
  };

  const remove = async () => {
    if (deleteBusy) return;
    if (!window.confirm("이 원고를 저장소와 운영 DB에서 영구 삭제할까요? 원문·변경 이력·생성 이미지를 복구할 수 없습니다.")) return;
    setDeleteBusy(true);
    try {
      await removeApi();
      navigate("/contents");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "원고 삭제에 실패했습니다.");
      setDeleteBusy(false);
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
          <Button icon={<Pencil size={17} />} disabled={status === "deleted" || connectionStatus !== "connected" || staleDetail || editBusy || deleteBusy} onClick={() => setEditOpen(true)}>직접 수정</Button>
          <Button variant="danger" icon={<Trash2 size={17} />} disabled={status === "deleted" || connectionStatus !== "connected" || staleDetail || editBusy || deleteBusy} onClick={() => void remove()}>삭제</Button>
          <Button icon={<Code2 size={17} />} disabled={!hasCopyContent || copyBusy} onClick={() => void copySource()}>
            HTML 소스 복사
          </Button>
          <Button icon={<Copy size={17} />} disabled={!hasCopyContent || copyBusy} onClick={() => void copyWithImages()}>
            이미지 포함 복사
          </Button>
          <Button icon={<Copy size={17} />} disabled={!copyPackage.trim()} onClick={() => {
            void navigator.clipboard.writeText(copyPackage).then(() => {
              setToast("네이버 블로그에 붙여넣을 원고를 복사했습니다.");
              window.setTimeout(() => setToast(""), 3200);
            });
          }}>텍스트 복사</Button>
          {toneResumeAvailable ? (
            <Button icon={<RefreshCw size={17} />} disabled={toneResumeBusy || connectionStatus !== "connected"} onClick={() => void resumeTone()}>
              {toneResumeBusy ? "재시도 요청 중..." : "저장 원고 재시도"}
            </Button>
          ) : null}
          {status !== "deleted" ? (
            <Button onClick={() => setRejectOpen(true)} disabled={!canReject}>수정 요청</Button>
          ) : null}
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

          {tab === "draft" ? <ArticleDraft title={latestVersion?.title} body={latestVersion?.body} contentId={detail.content.id} imagePackage={renderableImagePackage} /> : null}
          {tab === "sources" ? <EvidenceReviewPanel evidence={evidenceReview} sources={detail.sources} claims={detail.claims} /> : null}
          {tab === "images" ? <ImageAssetsView contentId={detail.content.id} packageState={imagePackage} contentStatus={status} pending={imagePending} busy={imageBusy} onGenerate={(assetId, feedback) => void generateImages(assetId, feedback)} /> : null}
          {tab === "history" ? <HistoryView versions={detail.versions} /> : null}
        </section>

        <aside className="quality-inspector">
          <h2>검수 결과</h2>
          <div className={`review-connection review-connection--${staleDetail ? "offline" : connectionStatus}`} role={staleDetail ? "alert" : undefined}>
            <span />
            {staleDetail ? "최신 원고 조회 지연 · 저장된 내용 표시 중" : "최신 원고와 자동 실행 기록 확인 완료"}
          </div>
          <section className="inspector-section auto-completion-state" aria-live="polite">
            <h3>{imageGenerationFailed ? "이미지 보완 필요" : imageGenerationReady ? "자동 완성 완료" : imageGenerationQueued ? "이미지 생성 중" : "자동 완성 상태"}</h3>
            <p>{imageGenerationFailed
              ? "원고는 저장되어 있습니다. 이미지 탭에서 실패한 이미지별로 재생성하거나 수정 의견을 남길 수 있습니다."
              : imageGenerationReady
                ? "원고와 이미지가 모두 저장되었습니다. 필요할 때만 수정 요청을 사용하세요."
                : imageGenerationQueued
                  ? "원고는 저장되어 있으며 이미지 생성 결과를 기다리고 있습니다."
                  : "원고는 자동으로 저장됩니다. 별도의 최종 확인 체크 없이 바로 확인하고 수정할 수 있습니다."}</p>
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

          {toneResumeAvailable ? (
            <section className="inspector-section review-recovery" role="status">
              <h3>원고 저장 완료 · 보완 가능</h3>
              <p>원고와 출처는 저장되어 있습니다. 말투 검수만 다시 실행하면 되므로 처음부터 생성해 토큰을 다시 쓰지 않습니다.</p>
              <Button icon={<RefreshCw size={16} />} disabled={toneResumeBusy} onClick={() => void resumeTone()}>
                {toneResumeBusy ? "재시도 요청 중..." : "말투 검수만 다시 실행"}
              </Button>
            </section>
          ) : null}

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
            <h3>한국어 자연스러움 검사</h3>
            {nativeKoreanQuality ? (
              <>
                <div className="diff-card">
                  <p>{nativeKoreanQuality.status === "passed" ? "번역체 검사 통과" : "보정이 필요한 표현이 있습니다."} · {nativeKoreanQuality.score}점</p>
                  <small>높음 {nativeKoreanQuality.counts.high}건 · 보통 {nativeKoreanQuality.counts.medium}건 · 낮음 {nativeKoreanQuality.counts.low}건</small>
                </div>
                {nativeKoreanQuality.issues.length ? (
                  <ul className="native-korean-issues">
                    {nativeKoreanQuality.issues.slice(0, 8).map((issue) => (
                      <li key={issue.id}>
                        <strong>{issue.excerpt}</strong>
                        {issue.rewriteExample ? <span>권장 표현: {issue.rewriteExample}</span> : null}
                        <small>{issue.suggestedDirection}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="review-empty-inline">검출된 번역체 표현이 없습니다.</p>}
              </>
            ) : <p className="review-empty-inline">이 원고에는 한국어 자연스러움 검사 결과가 없습니다.</p>}
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

      <RejectDialog open={rejectOpen} busy={decisionBusy !== null} mode="rewrite" onClose={() => setRejectOpen(false)} onReject={reject} />
      <EditContentDialog
        open={editOpen}
        busy={editBusy}
        initialTitle={latestVersion?.title ?? detail.content.title}
        initialBody={latestVersion?.body ?? ""}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
      />
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
  onGenerate: (assetId?: string, feedback?: string) => void;
}) {
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  // Image generation is independent from editorial approval. A draft can be
  // generated, reviewed, and repaired before any publication decision.
  const canGenerate = contentStatus !== "deleted";
  const readyPackage = isReadyImagePackage(packageState) ? packageState : null;
  const ready = readyPackage !== null;
  // Failed packages now retain their generated candidates. Show them in the
  // image tab for diagnosis and targeted repair, but never use them for copy
  // or publication (those paths remain ready-only below).
  const inspectablePackage = packageState && (packageState.assets?.length ?? 0) > 0 ? packageState : null;
  const assets = inspectablePackage?.assets ?? [];
  const previewOnly = inspectablePackage?.status === "failed";
  const displayable = assets.length > 0;
  const packageGeneratedAt = packageState?.generatedAt;
  const visualQuality = packageState?.visualQuality;
  const visualQualityByAsset = new Map((visualQuality?.assets ?? []).map((item) => [item.id, item]));
  const failedVisuals = visualQuality?.assets?.filter((item) => !item.passed) ?? [];
  return (
    <section className="image-assets" aria-label="생성 이미지">
      <header className="image-assets__header">
        <div>
          <h2>블로그 이미지</h2>
          <p>자동 생성된 원고에 대표 1장과 본문 2장을 실사 또는 고급 일러스트로 함께 제공합니다.</p>
        </div>
        {canGenerate ? (
          <Button variant={ready ? "outline" : "brand"} disabled={pending || busy} icon={<Images size={17} />} onClick={() => onGenerate()}>
            {pending ? "생성 중" : busy ? "요청 중" : ready ? "다시 생성" : "이미지 생성"}
          </Button>
        ) : null}
      </header>

      {pending ? (
        <div className="image-assets__state"><PageLoadingState label="고품질 대표 이미지와 본문 이미지를 생성하는 중입니다." /></div>
      ) : displayable ? (
        <>
          {previewOnly ? (
            <div className="image-assets__preview-warning" role="status">
              품질 검수 전 미리보기입니다. 현재 이미지는 진단·수정용이며 게시용 복사에는 포함되지 않습니다.
            </div>
          ) : null}
          <div className="image-assets__grid">
            {assets.map((asset) => (
              <figure className={asset.role === "hero" ? "image-asset image-asset--hero" : "image-asset"} key={asset.id}>
                <img src={contentImageUrl(contentId, asset.id, packageGeneratedAt, previewOnly)} alt={asset.altText} loading="lazy" />
                <figcaption>
                  {(() => {
                    const quality = visualQualityByAsset.get(asset.id);
                    if (!quality || quality.passed) return null;
                    const detail = quality.defects.length > 0 ? quality.defects.join(" · ") : quality.recommendation;
                    return (
                      <div className="image-asset__quality image-asset__quality--failed">
                        <strong>재생성 권장</strong>
                        <p>{detail}</p>
                      </div>
                    );
                  })()}
                  <div><strong>{asset.role === "hero" ? "대표 이미지" : `본문 ${asset.afterSection}절 뒤`}</strong><span>AI 실사·일러스트</span></div>
                  <p>{asset.altText}</p>
                  <div className="image-asset__feedback">
                    <label>
                      <span className="sr-only">{asset.id} 수정 의견</span>
                      <textarea
                        value={feedback[asset.id] ?? ""}
                        onChange={(event) => setFeedback((current) => ({ ...current, [asset.id]: event.target.value }))}
                        placeholder="이 이미지만 바꿀 의견을 적어주세요"
                        rows={2}
                      />
                    </label>
                    <Button
                      size="small"
                      disabled={pending || busy || !feedback[asset.id]?.trim()}
                      onClick={() => {
                        const value = feedback[asset.id]?.trim();
                        if (!value) return;
                        onGenerate(asset.id, value);
                      }}
                    >
                      이 이미지 수정
                    </Button>
                  </div>
                  <small>{asset.width}×{asset.height} · {Math.round(asset.bytes / 1024)}KB</small>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="image-assets__checks">
            <strong>자동 품질 검사</strong>
            {(packageState?.checks ?? []).map((check) => <span key={check.id} className={check.passed ? "passed" : "failed"}><CheckCircle2 size={16} />{check.label} · {check.detail}</span>)}
            <span className={visualQuality?.overallPassed ? "passed" : "failed"}><CheckCircle2 size={16} />AI 시각 품질 검사 · {visualQuality?.overallPassed ? "통과" : "확인 필요"}</span>
            <p>{visualQuality?.summary ?? "해상도·비율·용량 기준을 통과했습니다."} 최종 사용 전에는 사람·손·차량 디테일과 주제 적합성을 눈으로 한 번 더 확인해주세요.</p>
          </div>
        </>
      ) : packageState?.status === "queued" ? (
        <div className="image-assets__state">
          <strong>이미지 생성 대기 중입니다.</strong>
          <p>원고는 먼저 저장되었고, 이미지 작업은 별도 Actions에서 진행 중입니다. 잠시 후 새로고침하면 결과가 표시됩니다.</p>
        </div>
      ) : packageState?.status === "failed" ? (
        <div className="image-assets__state image-assets__state--failed">
          <strong>이미지 생성이 완료되지 않았습니다.</strong>
          <p>{visualQuality?.summary ?? packageState.message ?? "실행 이력을 확인하거나 이미지를 다시 생성해주세요."}</p>
          {failedVisuals.map((asset) => (
            <p key={asset.id}><strong>{asset.id}</strong> · {asset.defects.length > 0 ? asset.defects.join(" · ") : asset.recommendation}</p>
          ))}
        </div>
      ) : (
        <div className="image-assets__state">
          <strong>{canGenerate ? "아직 생성된 이미지가 없습니다." : "원고 패키지 완료 후 이미지를 생성합니다."}</strong>
          <p>{canGenerate ? "이미지 생성을 누르면 대표 이미지 1장과 본문 이미지 2장을 만듭니다." : "원고·말투·품질 검사가 끝난 뒤 생성해 사용 한도와 재작업을 줄입니다."}</p>
        </div>
      )}
    </section>
  );
}

let generatedImageContext: { contentId: string; imagePackage: ApiGeneratedImagePackage | null } | null = null;

function renderGeneratedBlocks(body: string): ReactNode[] {
  if (generatedImageContext) return renderGeneratedBlocksWithImages(body, generatedImageContext.contentId, generatedImageContext.imagePackage);
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

function renderGeneratedBlocksWithImages(body: string, contentId: string, imagePackage: ApiGeneratedImagePackage | null): ReactNode[] {
  const usableImagePackage = isReadyImagePackage(imagePackage) ? imagePackage : null;
  const assets = usableImagePackage?.assets ?? [];
  const imagesBySection = new Map<number, typeof assets>();
  for (const asset of assets.filter((item) => item.role === "inline")) {
    const current = imagesBySection.get(asset.afterSection) ?? [];
    current.push(asset);
    imagesBySection.set(asset.afterSection, current);
  }
  const hero = assets.find((asset) => asset.role === "hero");
  let sectionIndex = 0;
  const output: ReactNode[] = [];
  const pushSectionImages = (index: number) => {
    for (const asset of imagesBySection.get(index) ?? []) {
      output.push(
        <figure className="article-inline-image" key={`image-${asset.id}-${index}`}>
          <img src={contentImageUrl(contentId, asset.id, usableImagePackage?.generatedAt)} alt={asset.altText} loading="lazy" />
          <figcaption>{asset.altText}</figcaption>
        </figure>,
      );
    }
  };
  for (const [index, block] of body.split("\n\n").entries()) {
    const text = block.trim();
    if (!text) continue;
    if (text.startsWith("### ")) {
      output.push(<h4 key={index}>{renderInlineBold(text.slice(4), `h4-${index}`)}</h4>);
      continue;
    }
    if (text.startsWith("## ")) {
      if (sectionIndex > 0) pushSectionImages(sectionIndex);
      sectionIndex += 1;
      output.push(<h3 id={["differences", "before-switch", "faq"][Math.min(sectionIndex - 1, 2)]} key={index}>{renderInlineBold(text.slice(3), `h3-${index}`)}</h3>);
      continue;
    }
    if (text.startsWith("# ")) {
      output.push(<h2 id="summary" key={index}>{renderInlineBold(text.slice(2), `h2-${index}`)}</h2>);
      if (hero) {
        output.push(
          <figure className="article-inline-image article-inline-image--hero" key={`image-${hero.id}`}>
            <img src={contentImageUrl(contentId, hero.id, usableImagePackage?.generatedAt)} alt={hero.altText} />
            <figcaption>{hero.altText}</figcaption>
          </figure>,
        );
      }
      continue;
    }
    if (text.startsWith("- ")) {
      output.push(<ul key={index}>{text.split("\n").map((line, lineIndex) => <li key={`${lineIndex}-${line}`}>{renderInlineBold(line.replace(/^-\s*/, ""), `li-${index}-${lineIndex}`)}</li>)}</ul>);
      continue;
    }
    if (text.startsWith("> ")) {
      output.push(<p className="article-note" key={index}>{renderInlineBold(text.slice(2), `note-${index}`)}</p>);
      continue;
    }
    output.push(<p key={index}>{renderInlineBold(text, `p-${index}`)}</p>);
  }
  pushSectionImages(sectionIndex);
  return output;
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

function escapeCopyHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildCopyHtml(
  storedHtml: string,
  title: string,
  body: string,
  contentId: string,
  imagePackage: ApiGeneratedImagePackage | null,
  imageUrls: Record<string, string> = {},
): string {
  const usableImagePackage = isReadyImagePackage(imagePackage) ? imagePackage : null;
  const assets = usableImagePackage?.assets ?? [];
  const source = storedHtml.trim() || `<article><h1>${escapeCopyHtml(title)}</h1>${body.split("\n\n").map((block) => {
    const text = block.trim();
    if (!text) return "";
    if (text.startsWith("### ")) return `<h3>${escapeCopyHtml(text.slice(4))}</h3>`;
    if (text.startsWith("## ")) return `<h2>${escapeCopyHtml(text.slice(3))}</h2>`;
    if (text.startsWith("# ")) return `<h1>${escapeCopyHtml(text.slice(2))}</h1>`;
    if (text.startsWith("- ")) return `<ul>${text.split("\n").map((line) => `<li>${escapeCopyHtml(line.replace(/^-\s*/, ""))}</li>`).join("")}</ul>`;
    if (text.startsWith("> ")) return `<blockquote><p>${escapeCopyHtml(text.slice(2))}</p></blockquote>`;
    return `<p>${escapeCopyHtml(text)}</p>`;
  }).join("")}</article>`;
  const withoutUnavailableImages = assets.length > 0 ? source : removeUnavailableImages(source);
  const withResolvedImages = withoutUnavailableImages.replace(/(src=["'])images\/([^"']+)(["'])/g, (_match, prefix: string, fileName: string, suffix: string) => {
    const asset = assets.find((item) => item.path === fileName || `${item.id}.jpg` === fileName);
    const url = asset ? imageUrls[asset.id] ?? contentImageUrl(contentId, asset.id, usableImagePackage?.generatedAt) : `images/${fileName}`;
    return `${prefix}${url}${suffix}`;
  });
  return decorateNaverCopyHtml(withResolvedImages, assets, imageUrls, contentId, usableImagePackage?.generatedAt);
}

function removeUnavailableImages(html: string): string {
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  documentCopy.querySelectorAll("img").forEach((image) => {
    const figure = image.closest("figure");
    if (figure) figure.remove();
    else image.remove();
  });
  return documentCopy.body.innerHTML;
}

function decorateNaverCopyHtml(
  html: string,
  assets: NonNullable<ApiGeneratedImagePackage["assets"]>,
  imageUrls: Record<string, string>,
  contentId: string,
  version?: string,
): string {
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  const article = documentCopy.querySelector("article") ?? documentCopy.body;
  if (!article.querySelector("img") && assets.length) {
    const headings = [...article.querySelectorAll("h2")];
    for (const asset of assets) {
      const figure = documentCopy.createElement("figure");
      const image = documentCopy.createElement("img");
      image.src = imageUrls[asset.id] ?? contentImageUrl(contentId, asset.id, version);
      image.alt = asset.altText;
      figure.append(image);
      if (asset.role === "hero") (article.querySelector("h1") ?? article.firstElementChild)?.after(figure);
      else (headings[Math.max(0, asset.afterSection - 1)] ?? article.lastElementChild)?.after(figure);
    }
  }
  article.setAttribute("style", "max-width:760px;margin:0 auto;color:#202124;font-family:Arial,'Noto Sans KR',sans-serif;font-size:16px;line-height:1.9;word-break:keep-all;");
  article.querySelectorAll("h1").forEach((element) => element.setAttribute("style", "margin:0 0 32px;font-size:32px;line-height:1.35;font-weight:800;word-break:keep-all;"));
  article.querySelectorAll("h2").forEach((element) => element.setAttribute("style", "margin:44px 0 18px;font-size:24px;line-height:1.45;font-weight:800;word-break:keep-all;"));
  article.querySelectorAll("h3").forEach((element) => element.setAttribute("style", "margin:32px 0 14px;font-size:20px;line-height:1.5;font-weight:750;word-break:keep-all;"));
  article.querySelectorAll("p").forEach((element) => element.setAttribute("style", "margin:0 0 22px;line-height:1.9;white-space:pre-wrap;word-break:keep-all;"));
  article.querySelectorAll("ul,ol").forEach((element) => element.setAttribute("style", "margin:0 0 24px;padding-left:24px;"));
  article.querySelectorAll("li").forEach((element) => element.setAttribute("style", "margin:0 0 10px;line-height:1.8;word-break:keep-all;"));
  article.querySelectorAll("blockquote").forEach((element) => element.setAttribute("style", "margin:24px 0;padding:18px 20px;border-left:4px solid #ff6f0f;background:#fff6f0;"));
  article.querySelectorAll("figure").forEach((element) => element.setAttribute("style", "margin:30px 0 34px;text-align:center;"));
  article.querySelectorAll("img").forEach((element) => element.setAttribute("style", "display:block;width:100%;max-width:760px;height:auto;margin:0 auto;border:0;"));
  return article.outerHTML;
}

async function copyHtmlSource(html: string, setToast: (message: string) => void): Promise<void> {
  await navigator.clipboard.writeText(html);
  setToast("이미지 주소와 줄 간격을 포함한 HTML 소스를 복사했습니다.");
}

function copyViaSelection(html: string): boolean {
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.append(container);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);
  try {
    return document.execCommand("copy");
  } finally {
    selection?.removeAllRanges();
    container.remove();
  }
}

async function copyRichContent(html: string, plainText: string, setToast: (message: string) => void): Promise<void> {
  const normalizedText = plainText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  try {
    if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([normalizedText], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } else if (!copyViaSelection(html)) {
      throw new Error("서식 클립보드를 지원하지 않는 브라우저입니다.");
    }
    setToast("이미지와 문단 간격을 포함해 복사했습니다. 15분 안에 네이버 편집기에 붙여넣으세요.");
  } catch {
    if (copyViaSelection(html)) setToast("이미지와 문단 간격을 포함해 복사했습니다. 15분 안에 붙여넣으세요.");
    else throw new Error("브라우저의 서식 복사 권한을 확인해주세요.");
  }
}

function ArticleDraft({ title, body, contentId, imagePackage }: { title?: string; body?: string; contentId: string; imagePackage: ApiGeneratedImagePackage | null }) {
  generatedImageContext = { contentId, imagePackage };
  if (!body?.trim()) return <div className="review-content-empty">저장된 원고 본문이 없습니다.</div>;
  return <article className="article-draft article-draft--generated" aria-label={`${title ?? "생성된 원고"} 본문`}>{renderGeneratedBlocks(body)}</article>;
}

function HistoryView({ versions }: { versions: ApiContentVersion[] }) {
  const historyItems = [...versions].reverse().map((version) => [
        `v${version.sequence}`,
        { human_tone: "사람 말투 보정", geo: "GEO 편집", seo: "SEO 편집", draft: "초안 생성", brief: "기획서 생성", manual: "사람 수정" }[version.stage],
        version.stage === "human_tone" ? "skill runner" : "자동화 작업",
        Number.isFinite(new Date(version.createdAt).getTime())
          ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(version.createdAt))
          : "기록 없음",
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
