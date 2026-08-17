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

export interface TrendCollector {
  collect(topic: string): Promise<TrendSignal[]>;
}

export interface ResearchResult {
  sources: SourceRecord[];
  claims: ClaimRecord[];
}

export interface ResearchVerifier {
  verify(content: ContentRecord, signals: TrendSignal[]): Promise<ResearchResult>;
}

export interface GeneratedDocument {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

export interface ContentGenerator {
  createBrief(content: ContentRecord, signals: TrendSignal[], claims: ClaimRecord[]): Promise<ContentBrief>;
  writeDraft(content: ContentRecord, brief: ContentBrief, claims: ClaimRecord[]): Promise<GeneratedDocument>;
  optimizeSeo(document: GeneratedDocument, brief: ContentBrief): Promise<GeneratedDocument>;
  optimizeGeo(document: GeneratedDocument, claims: ClaimRecord[]): Promise<GeneratedDocument>;
}

export interface HumanToneResult extends GeneratedDocument {
  changedProtectedTerms: string[];
  diffSummary: string[];
  skillName: string;
  skillVersion: string;
}

export interface HumanToneRunner {
  run(document: GeneratedDocument, protectedTerms: string[]): Promise<HumanToneResult>;
}

export interface QualityReviewer {
  review(content: ContentRecord, version: ContentVersion, claims: ClaimRecord[]): Promise<QualityResult[]>;
}

export interface ReviewNotifier {
  notifyReviewReady(content: ContentRecord, version: ContentVersion): Promise<void>;
}

export interface Publisher {
  prepare(content: ContentRecord, version: ContentVersion): Promise<PublicationRecord>;
  publish(publication: PublicationRecord): Promise<PublicationRecord>;
}

export interface AutomationAdapters {
  trendCollector: TrendCollector;
  researchVerifier: ResearchVerifier;
  contentGenerator: ContentGenerator;
  humanToneRunner: HumanToneRunner;
  qualityReviewer: QualityReviewer;
  notifier: ReviewNotifier;
  publisher: Publisher;
}
