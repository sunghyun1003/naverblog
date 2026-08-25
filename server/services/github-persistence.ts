import type { ContentDetail, ContentRecord, TrendSignal } from "../domain/types.js";
import type { AutomationRepository } from "../repositories/contracts.js";
import { draftToContent, draftToDetail } from "./github-content-mapper.js";
import type { AutomationDraftDetail, AutomationDraftSummary } from "./github-automation.js";

export interface CollectedTrendsForPersistence {
  collectedAt: string;
  items: Array<{
    title: string;
    link: string;
    postdate: string;
    candidateScore: number;
    matchedQueries: string[];
    bestSimilarityRank?: number | null;
    observedDays?: number;
  }>;
}

async function upsertContent(repository: AutomationRepository, content: ContentRecord): Promise<ContentRecord> {
  const existing = await repository.getContent(content.id);
  return existing ? repository.updateContent(content) : repository.createContent(content);
}

export async function persistGitHubDraftSummaries(
  repository: AutomationRepository,
  drafts: AutomationDraftSummary[],
): Promise<ContentRecord[]> {
  const contents: ContentRecord[] = [];
  for (const draft of drafts) contents.push(await upsertContent(repository, draftToContent(draft)));
  return contents;
}

export async function persistGitHubDraftDetail(
  repository: AutomationRepository,
  draft: AutomationDraftDetail,
): Promise<ContentDetail> {
  const detail = draftToDetail(draft);
  await upsertContent(repository, detail.content);
  await repository.saveSources(detail.content.id, detail.sources);
  await repository.saveClaims(detail.content.id, detail.claims);
  for (const version of detail.versions) await repository.saveVersion(version);
  for (const job of detail.jobs) {
    const existing = await repository.getJob(job.id);
    if (existing) await repository.updateJob(job);
    else await repository.createJob(job);
  }
  await repository.saveQualityResults(detail.content.id, detail.qualityResults);
  for (const approval of detail.approvals) await repository.saveApproval(approval);
  for (const publication of detail.publications) await repository.savePublication(publication);
  for (const event of detail.auditEvents) await repository.appendAudit(event);
  return (await repository.getContentDetail(detail.content.id)) ?? detail;
}

function normalizedPostDate(postdate: string, fallback: string): string {
  if (/^\d{8}$/.test(postdate)) {
    return `${postdate.slice(0, 4)}-${postdate.slice(4, 6)}-${postdate.slice(6, 8)}T00:00:00.000Z`;
  }
  const timestamp = Date.parse(postdate);
  return Number.isNaN(timestamp) ? fallback : new Date(timestamp).toISOString();
}

export async function persistGitHubTrends(
  repository: AutomationRepository,
  snapshot: CollectedTrendsForPersistence,
): Promise<TrendSignal[]> {
  const collectedAt = Number.isNaN(Date.parse(snapshot.collectedAt)) ? new Date().toISOString() : snapshot.collectedAt;
  const scoreScale = Math.max(100, ...snapshot.items.map((item) => item.candidateScore));
  const normalizedScore = (score: number) => Math.max(0, Math.min(100, (score / scoreScale) * 100));
  const signals = snapshot.items.map((item, index): TrendSignal => ({
    id: `github-trend:${encodeURIComponent(item.link || item.title)}:${index + 1}`,
    sourceType: "naver_blog",
    title: item.title,
    url: item.link || `urn:naverblog:trend:${index + 1}`,
    publishedAt: normalizedPostDate(item.postdate, collectedAt),
    engagementScore: 0,
    relevanceScore: normalizedScore(item.candidateScore),
    trustScore: 40,
    topicKey: item.matchedQueries[0] ?? "보험",
    collectedAt,
  }));
  await repository.saveTrendSignals(signals);
  return signals;
}
