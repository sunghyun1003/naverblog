import type {
  AutomationAdapters,
  ContentGenerator,
  GeneratedDocument,
  HumanToneRunner,
  Publisher,
  QualityReviewer,
  ResearchVerifier,
  ReviewNotifier,
  TrendCollector,
} from "./contracts.js";
import type {
  ClaimRecord,
  ContentBrief,
  ContentRecord,
  ContentVersion,
  PublicationRecord,
  QualityResult,
  SourceRecord,
  TrendSignal,
} from "../domain/types.js";
import type { Clock, IdFactory } from "../domain/utils.js";

class MockTrendCollector implements TrendCollector {
  constructor(private readonly clock: Clock, private readonly id: IdFactory) {}

  async collect(topic: string): Promise<TrendSignal[]> {
    const now = this.clock();
    const key = topic.replace(/\s+/g, "-").toLowerCase();
    return [
      ["naver_blog", `${topic}, 사람들이 가장 헷갈리는 기준`, "https://example.test/naver/trend-1", 86, 91, 55],
      ["community", `${topic} 실제 질문 모음`, "https://example.test/community/trend-2", 92, 88, 48],
      ["naver_blog", `${topic} 확인 기준 정리`, "https://example.test/naver/trend-3", 79, 85, 52],
    ].map(([sourceType, title, url, engagementScore, relevanceScore, trustScore]) => ({
      id: this.id(),
      sourceType: sourceType as TrendSignal["sourceType"],
      title: String(title),
      url: String(url),
      publishedAt: now,
      engagementScore: Number(engagementScore),
      relevanceScore: Number(relevanceScore),
      trustScore: Number(trustScore),
      topicKey: key,
      collectedAt: now,
    }));
  }
}

class MockResearchVerifier implements ResearchVerifier {
  constructor(private readonly clock: Clock, private readonly id: IdFactory) {}

  async verify(content: ContentRecord, signals: TrendSignal[]) {
    const now = this.clock();
    const sourceSeeds = [
      ["금융위원회", "금융 소비자 정보 확인 원칙", "https://example.test/official/fsc"],
      ["금융감독원", "보험 가입 및 전환 유의사항", "https://example.test/official/fss"],
      ["보험개발원", "보험 제도 구조 참고자료", "https://example.test/official/kidi"],
    ];
    const sources: SourceRecord[] = sourceSeeds.map(([organization, title, url]) => ({
      id: this.id(),
      contentId: content.id,
      organization: String(organization),
      title: String(title),
      url: String(url),
      sourceType: "official",
      publishedAt: null,
      collectedAt: now,
      trustGrade: "A",
    }));
    const claims: ClaimRecord[] = sources.map((source, index) => ({
      id: this.id(),
      contentId: content.id,
      sourceId: source.id,
      statement: [
        "보험의 보장 조건은 가입 시기와 개별 약관에 따라 달라질 수 있습니다.",
        "보험 변경은 보험료뿐 아니라 보장 범위와 자기부담 조건을 함께 확인해야 합니다.",
        "온라인 정보만으로 결론 내리지 말고 가입한 계약의 약관과 공식 안내를 확인해야 합니다.",
      ][index]!,
      evidenceExcerpt: `${source.organization}의 공식 안내를 바탕으로 작성한 검증용 요약입니다.`,
      evidenceLocator: `mock:${index + 1}`,
      effectiveDate: null,
      verificationStatus: "verified",
      createdAt: now,
    }));
    if (signals.length === 0) throw new Error("기획 근거가 될 트렌드 신호가 없습니다.");
    return { sources, claims };
  }
}

class MockContentGenerator implements ContentGenerator {
  async createBrief(content: ContentRecord, signals: TrendSignal[], claims: ClaimRecord[]): Promise<ContentBrief> {
    return {
      audience: "보험 정보를 쉽게 이해하고 싶은 일반 소비자",
      searchIntent: `${content.topic}의 핵심 기준과 주의사항 확인`,
      coreQuestion: `${content.topic}에서 가장 먼저 확인해야 할 것은 무엇일까?`,
      angle: content.strategy === "trend"
        ? "인기 질문을 출발점으로 삼되 공식 근거로 다시 검증하는 설명형 콘텐츠"
        : "공식 근거와 내부 아이디어를 중심으로 처음부터 구성하는 설명형 콘텐츠",
      outline: ["한눈에 보는 핵심", "꼭 확인할 기준", "실수하기 쉬운 부분", "자주 묻는 질문"],
      protectedTerms: ["약관", "보장 범위", "자기부담", ...claims.map((claim) => claim.statement)],
      ...(signals.length > 0 ? {} : { outline: ["핵심 안내"] }),
    };
  }

  async writeDraft(content: ContentRecord, brief: ContentBrief, claims: ClaimRecord[]): Promise<GeneratedDocument> {
    const evidenceList = claims.map((claim) => `- ${claim.statement}`).join("\n");
    return {
      title: content.title,
      body: `# ${content.title}\n\n${brief.coreQuestion}\n\n## 한눈에 보는 핵심\n\n보험 정보는 한 가지 조건만으로 판단하기 어렵습니다. 가입한 계약의 약관과 현재 상황을 함께 확인해야 해요.\n\n## 꼭 확인할 기준\n\n${evidenceList}\n\n## 실수하기 쉬운 부분\n\n보험료만 비교하거나 온라인 사례를 내 계약에 그대로 적용하면 실제 보장과 차이가 생길 수 있습니다.\n\n## 자주 묻는 질문\n\n### 지금 바로 변경해야 하나요?\n\n모든 사람에게 같은 선택이 유리한 것은 아닙니다. 현재 계약과 대안을 비교한 뒤 판단하세요.`,
      metadata: { generator: "mock", evidenceCount: claims.length },
    };
  }

  async optimizeSeo(document: GeneratedDocument, brief: ContentBrief): Promise<GeneratedDocument> {
    return {
      ...document,
      metadata: { ...document.metadata, seo: { intent: brief.searchIntent, titleLength: document.title.length } },
    };
  }

  async optimizeGeo(document: GeneratedDocument, claims: ClaimRecord[]): Promise<GeneratedDocument> {
    return {
      ...document,
      body: `${document.body}\n\n> 기준일과 세부 조건은 연결된 공식 출처 및 실제 약관을 확인하세요.`,
      metadata: { ...document.metadata, geo: { directAnswer: true, citations: claims.length, faq: true } },
    };
  }
}

class MockHumanToneRunner implements HumanToneRunner {
  async run(document: GeneratedDocument, protectedTerms: string[]) {
    const body = document.body
      .replaceAll("판단하기 어렵습니다.", "판단하기가 생각보다 쉽지 않아요.")
      .replaceAll("확인해야 해요.", "차근차근 확인해보는 게 좋아요.");
    const changedProtectedTerms = protectedTerms.filter((term) => document.body.includes(term) && !body.includes(term));
    return {
      ...document,
      body,
      metadata: { ...document.metadata, humanTone: { applied: true } },
      changedProtectedTerms,
      diffSummary: ["딱딱한 종결 표현을 자연스러운 설명형 문장으로 조정"],
      skillName: "mock-human-tone",
      skillVersion: "0.1.0",
    };
  }
}

class MockQualityReviewer implements QualityReviewer {
  constructor(private readonly clock: Clock, private readonly id: IdFactory) {}

  async review(content: ContentRecord, version: ContentVersion, claims: ClaimRecord[]): Promise<QualityResult[]> {
    const now = this.clock();
    const base = { contentId: content.id, versionId: version.id, checkedAt: now };
    const values: Array<Omit<QualityResult, "id" | keyof typeof base>> = [
      { category: "facts", status: claims.length >= 3 ? "passed" : "failed", score: claims.length >= 3 ? 100 : 40, messages: [`검증된 주장 ${claims.length}건 연결`] },
      { category: "seo", status: "passed", score: 92, messages: ["검색 의도와 제목·본문 구조 일치"] },
      { category: "geo", status: "passed", score: 94, messages: ["직접 답변·FAQ·출처 안내 포함"] },
      { category: "tone", status: "passed", score: 90, messages: ["사람 말투 보정 결과와 보호 문구 확인"] },
      { category: "advertising", status: "warning", score: 78, messages: ["사람이 비교 표현을 최종 확인해야 합니다."] },
      { category: "editorial", status: "passed", score: 92, messages: ["본문 형식과 시각 자료 계획이 균형 있게 구성됐습니다."] },
    ];
    return values.map((value) => ({ id: this.id(), ...base, ...value }));
  }
}

class MockNotifier implements ReviewNotifier {
  readonly notifications: Array<{ contentId: string; versionId: string }> = [];

  async notifyReviewReady(content: ContentRecord, version: ContentVersion): Promise<void> {
    this.notifications.push({ contentId: content.id, versionId: version.id });
  }
}

class MockPublisher implements Publisher {
  constructor(private readonly clock: Clock, private readonly id: IdFactory) {}

  async prepare(content: ContentRecord, _version: ContentVersion): Promise<PublicationRecord> {
    const now = this.clock();
    return {
      id: this.id(),
      contentId: content.id,
      status: "prepared",
      scheduledAt: null,
      publishedAt: null,
      externalUrl: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async publish(publication: PublicationRecord): Promise<PublicationRecord> {
    const now = this.clock();
    return { ...publication, status: "published", publishedAt: now, updatedAt: now, externalUrl: "https://blog.naver.com/mock/published" };
  }
}

export function createMockAdapters(clock: Clock, id: IdFactory): AutomationAdapters {
  return {
    trendCollector: new MockTrendCollector(clock, id),
    researchVerifier: new MockResearchVerifier(clock, id),
    contentGenerator: new MockContentGenerator(),
    humanToneRunner: new MockHumanToneRunner(),
    qualityReviewer: new MockQualityReviewer(clock, id),
    notifier: new MockNotifier(),
    publisher: new MockPublisher(clock, id),
  };
}
