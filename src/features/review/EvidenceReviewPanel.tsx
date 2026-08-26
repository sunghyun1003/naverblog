import { ExternalLink, FileCheck2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ApiClaim, ApiContentVersion, ApiEvidenceReview, ApiSource } from "../../api/types";

const claimStatus: Record<ApiEvidenceReview["claims"][number]["verificationStatus"], { label: string; tone: string }> = {
  CROSS_VERIFIED: { label: "기관 교차검증", tone: "cross" },
  SUPPORTED: { label: "공식 근거 확인", tone: "supported" },
  CONDITIONAL: { label: "조건부 사용", tone: "conditional" },
  UNRESOLVED: { label: "미확인", tone: "unresolved" },
};

const gapHandling = {
  omit: "원고에서 제외",
  qualify: "조건부 표현",
  human_review: "사람 확인 필요",
} as const;

export function evidenceReviewFrom(version?: ApiContentVersion | null): ApiEvidenceReview | null {
  const value = version?.metadata.evidenceReview;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ApiEvidenceReview>;
  if (!candidate.contentBrief || !Array.isArray(candidate.sources) || !Array.isArray(candidate.claims) || !Array.isArray(candidate.gaps)) return null;
  return candidate as ApiEvidenceReview;
}

export function EvidenceReviewPanel({
  evidence,
  sources,
  claims,
}: {
  evidence: ApiEvidenceReview | null;
  sources: ApiSource[];
  claims: ApiClaim[];
}) {
  if (!evidence) return <LegacyEvidence sources={sources} claims={claims} />;

  const sourceById = new Map(evidence.sources.map((source) => [source.id, source]));
  const institutionCount = new Set(evidence.sources.map((source) => source.institution)).size;
  const crossVerifiedCount = evidence.claims.filter((claim) => claim.verificationStatus === "CROSS_VERIFIED").length;

  return (
    <div className="evidence-view" id="sources">
      <header>
        <h2>공식 근거 검수</h2>
        <p>인기 콘텐츠는 소재 선택에만 사용하고, 보험 관련 사실은 아래 공식 자료와 주장 장부를 기준으로 확인합니다.</p>
      </header>

      <div className="evidence-summary" aria-label="공식 근거 요약">
        <EvidenceMetric value={evidence.sources.length} label="공식 출처" />
        <EvidenceMetric value={institutionCount} label="공식 기관" />
        <EvidenceMetric value={crossVerifiedCount} label="교차검증" />
        <EvidenceMetric value={evidence.gaps.length} label="추가 확인" warning={evidence.gaps.length > 0} />
      </div>

      <section className="evidence-brief">
        <div className="evidence-section-heading">
          <span className="evidence-section-icon"><ShieldCheck size={17} /></span>
          <div><h3>원고 기획 기준</h3><p>{evidence.contentBrief.primaryIntent} 중심 · {evidence.contentBrief.secondaryIntent} 보조</p></div>
        </div>
        <dl className="evidence-brief-grid">
          <div><dt>독자가 처한 순간</dt><dd>{evidence.contentBrief.audienceMoment}</dd></div>
          <div><dt>해결할 문제</dt><dd>{evidence.contentBrief.readerProblem}</dd></div>
          <div><dt>읽고 얻는 결과</dt><dd>{evidence.contentBrief.contentPromise}</dd></div>
          <div><dt>차별화 방향</dt><dd>{evidence.contentBrief.differentiation}</dd></div>
        </dl>
        <ol className="evidence-outline-list">
          {evidence.contentBrief.outlineLogic.map((item, index) => <li key={`${index}-${item}`}><span>{index + 1}</span>{item}</li>)}
        </ol>
      </section>

      <section className="evidence-claims">
        <div className="evidence-section-heading">
          <span className="evidence-section-icon"><FileCheck2 size={17} /></span>
          <div><h3>주장별 근거 연결</h3><p>각 문장이 어떤 공식 원문에 기대고 있는지 확인할 수 있습니다.</p></div>
        </div>
        <div className="evidence-claim-list">
          {evidence.claims.map((claim) => {
            const status = claimStatus[claim.verificationStatus];
            const linkedSources = claim.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter((source) => source !== undefined);
            return (
              <article className="evidence-claim" key={claim.id}>
                <header>
                  <strong>{claim.id}</strong>
                  <span className={`evidence-status evidence-status--${status.tone}`}>{status.label}</span>
                </header>
                <p>{claim.claim}</p>
                <div className="evidence-source-tags">
                  {linkedSources.map((source) => (
                    <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                      {source.institution} · {source.title}<ExternalLink size={13} />
                    </a>
                  ))}
                </div>
                {claim.scopeNote ? <small>{claim.scopeNote}</small> : null}
              </article>
            );
          })}
        </div>
      </section>

      {evidence.gaps.length ? (
        <section className="evidence-gaps" aria-label="추가 확인 항목">
          <div className="evidence-section-heading">
            <span className="evidence-section-icon evidence-section-icon--warning"><TriangleAlert size={17} /></span>
            <div><h3>발행 전 추가 확인</h3><p>근거가 충분하지 않아 자동으로 제외하거나 조건부 처리한 내용입니다.</p></div>
          </div>
          <ul>
            {evidence.gaps.map((gap) => <li key={`${gap.questionId}-${gap.reason}`}><strong>{gapHandling[gap.draftHandling]}</strong><span>{gap.reason}</span></li>)}
          </ul>
        </section>
      ) : null}

      <section className="evidence-register">
        <div className="evidence-section-heading">
          <span className="evidence-section-icon"><ShieldCheck size={17} /></span>
          <div><h3>공식 출처 원문</h3><p>권위 등급 A는 법령·감독기관, B는 협회·공식 비교공시 자료입니다.</p></div>
        </div>
        <div className="evidence-register-list">
          {evidence.sources.map((source) => (
            <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
              <span className={`evidence-trust evidence-trust--${source.authorityTier}`}>{source.authorityTier === 1 ? "A" : "B"}</span>
              <span><strong>{source.institution}</strong><b>{source.title}</b><small>{source.supportSummary}</small></span>
              <span className="evidence-register-meta">{source.publishedOrEffectiveDate ?? "기준일 확인"}<ExternalLink size={14} /></span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function EvidenceMetric({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  return <div className={warning ? "evidence-metric evidence-metric--warning" : "evidence-metric"}><strong>{value}</strong><span>{label}</span></div>;
}

function LegacyEvidence({ sources, claims }: { sources: ApiSource[]; claims: ApiClaim[] }) {
  const claimBySourceId = new Map<string, ApiClaim[]>();
  for (const claim of claims) claimBySourceId.set(claim.sourceId, [...(claimBySourceId.get(claim.sourceId) ?? []), claim]);
  return (
    <div className="evidence-view" id="sources">
      <header><h2>근거와 주장 연결</h2><p>이 원고는 공식 근거 패키지 도입 전에 생성되어 저장된 출처와 사실 확인 항목을 표시합니다.</p></header>
      {sources.map((source, index) => (
        <section className="evidence-legacy-source" key={source.id}>
          <span className="evidence-index">{index + 1}</span>
          <div>
            <h3>{source.organization} · {source.title}</h3>
            <p>{source.sourceType === "official" ? "공식 자료" : "소재 참고"} · 신뢰 등급 {source.trustGrade}</p>
            {(claimBySourceId.get(source.id) ?? []).map((claim) => <blockquote key={claim.id}>{claim.statement}</blockquote>)}
            {/^(https?:\/\/)/i.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">원문 열기 <ExternalLink size={14} /></a> : null}
          </div>
        </section>
      ))}
      {!sources.length ? <div className="review-content-empty">저장된 근거 자료가 없습니다.</div> : null}
    </div>
  );
}
