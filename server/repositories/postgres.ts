import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  ApprovalRecord,
  AuditEvent,
  AutomationJob,
  ClaimRecord,
  ContentDetail,
  ContentRecord,
  ContentVersion,
  JobStep,
  PublicationRecord,
  QualityResult,
  SourceRecord,
  TrendSignal,
} from "../domain/types.js";
import type { AutomationRepository } from "./contracts.js";

export interface PostgresRepositoryOptions {
  connectionString: string;
  teamId: string;
  maxConnections?: number;
}

function contentFrom(row: QueryResultRow): ContentRecord {
  return {
    id: row.id,
    creationKey: row.creation_key,
    title: row.title,
    topic: row.topic,
    strategy: row.strategy,
    state: row.state,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  };
}

function versionFrom(row: QueryResultRow): ContentVersion {
  return {
    id: row.id,
    contentId: row.content_id,
    sequence: row.sequence,
    stage: row.stage,
    title: row.title,
    body: row.body,
    brief: row.brief,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    parentVersionId: row.parent_version_id,
    metadata: row.metadata ?? {},
  };
}

function jobStepFrom(row: QueryResultRow): JobStep {
  return {
    stage: row.stage,
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    outputVersionId: row.output_version_id,
    error: row.error,
  };
}

export class PostgresAutomationRepository implements AutomationRepository {
  readonly pool: Pool;

  constructor(
    private readonly teamId: string,
    pool: Pool,
  ) {
    this.pool = pool;
  }

  static create(options: PostgresRepositoryOptions): PostgresAutomationRepository {
    const pool = new Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    return new PostgresAutomationRepository(options.teamId, pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createContent(content: ContentRecord): Promise<ContentRecord> {
    const result = await this.pool.query(
      `INSERT INTO contents
        (id, team_id, creation_key, title, topic, strategy, state, assignee_id, created_by, scheduled_at, published_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (team_id, creation_key) DO UPDATE SET creation_key = EXCLUDED.creation_key
       RETURNING *`,
      [content.id, this.teamId, content.creationKey, content.title, content.topic, content.strategy, content.state, content.assigneeId, content.createdBy, content.scheduledAt, content.publishedAt, content.createdAt, content.updatedAt],
    );
    return contentFrom(result.rows[0]!);
  }

  async updateContent(content: ContentRecord): Promise<ContentRecord> {
    const result = await this.pool.query(
      `UPDATE contents SET title=$3, topic=$4, strategy=$5, state=$6, assignee_id=$7, scheduled_at=$8, published_at=$9, updated_at=$10
       WHERE id=$1 AND team_id=$2 RETURNING *`,
      [content.id, this.teamId, content.title, content.topic, content.strategy, content.state, content.assigneeId, content.scheduledAt, content.publishedAt, content.updatedAt],
    );
    if (!result.rows[0]) throw new Error("Content not found");
    return contentFrom(result.rows[0]);
  }

  async getContent(id: string): Promise<ContentRecord | null> {
    const result = await this.pool.query("SELECT * FROM contents WHERE id=$1 AND team_id=$2", [id, this.teamId]);
    return result.rows[0] ? contentFrom(result.rows[0]) : null;
  }

  async findContentByCreationKey(key: string): Promise<ContentRecord | null> {
    const result = await this.pool.query("SELECT * FROM contents WHERE team_id=$1 AND creation_key=$2", [this.teamId, key]);
    return result.rows[0] ? contentFrom(result.rows[0]) : null;
  }

  async listContents(): Promise<ContentRecord[]> {
    const result = await this.pool.query("SELECT * FROM contents WHERE team_id=$1 ORDER BY updated_at DESC", [this.teamId]);
    return result.rows.map(contentFrom);
  }

  async getContentDetail(id: string): Promise<ContentDetail | null> {
    const content = await this.getContent(id);
    if (!content) return null;
    const [versions, sources, claims, qualityResults, jobs, approvals, publications, auditEvents] = await Promise.all([
      this.listVersions(id), this.listSources(id), this.listClaims(id), this.listQualityResults(id), this.listJobs(id),
      this.listApprovals(id), this.listPublications(id), this.listAuditEvents(id),
    ]);
    return { content, versions, sources, claims, qualityResults, jobs, approvals, publications, auditEvents };
  }

  async saveTrendSignals(signals: TrendSignal[]): Promise<TrendSignal[]> {
    for (const signal of signals) {
      await this.pool.query(
        `INSERT INTO trend_signals
          (id, team_id, source_type, title, canonical_url, published_at, engagement_score, relevance_score, trust_score, topic_key, collected_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (team_id, canonical_url) DO UPDATE SET
          title=EXCLUDED.title, published_at=EXCLUDED.published_at, engagement_score=EXCLUDED.engagement_score,
          relevance_score=EXCLUDED.relevance_score, trust_score=EXCLUDED.trust_score, collected_at=EXCLUDED.collected_at`,
        [signal.id, this.teamId, signal.sourceType, signal.title, signal.url, signal.publishedAt, signal.engagementScore, signal.relevanceScore, signal.trustScore, signal.topicKey, signal.collectedAt],
      );
    }
    return signals;
  }

  async listTrendSignals(): Promise<TrendSignal[]> {
    const result = await this.pool.query("SELECT * FROM trend_signals WHERE team_id=$1 ORDER BY engagement_score DESC", [this.teamId]);
    return result.rows.map((row) => ({
      id: row.id, sourceType: row.source_type, title: row.title, url: row.canonical_url,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : new Date(row.collected_at).toISOString(),
      engagementScore: Number(row.engagement_score), relevanceScore: Number(row.relevance_score), trustScore: Number(row.trust_score),
      topicKey: row.topic_key, collectedAt: new Date(row.collected_at).toISOString(),
    }));
  }

  async saveSources(contentId: string, sources: SourceRecord[]): Promise<SourceRecord[]> {
    for (const source of sources) {
      await this.pool.query(
        `INSERT INTO sources (id, content_id, organization, title, canonical_url, source_type, published_at, collected_at, trust_grade)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (content_id, canonical_url) DO UPDATE SET title=EXCLUDED.title, collected_at=EXCLUDED.collected_at, trust_grade=EXCLUDED.trust_grade`,
        [source.id, contentId, source.organization, source.title, source.url, source.sourceType, source.publishedAt, source.collectedAt, source.trustGrade],
      );
    }
    return sources;
  }

  async listSources(contentId: string): Promise<SourceRecord[]> {
    const result = await this.pool.query(
      `SELECT s.* FROM sources s JOIN contents c ON c.id=s.content_id WHERE s.content_id=$1 AND c.team_id=$2 ORDER BY s.collected_at DESC`,
      [contentId, this.teamId],
    );
    return result.rows.map((row) => ({
      id: row.id, contentId: row.content_id, organization: row.organization, title: row.title, url: row.canonical_url,
      sourceType: row.source_type, publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      collectedAt: new Date(row.collected_at).toISOString(), trustGrade: row.trust_grade,
    }));
  }

  async saveClaims(contentId: string, claims: ClaimRecord[]): Promise<ClaimRecord[]> {
    for (const claim of claims) {
      await this.pool.query(
        `INSERT INTO claims
          (id, content_id, source_id, statement, evidence_excerpt, evidence_locator, effective_date, verification_status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [claim.id, contentId, claim.sourceId, claim.statement, claim.evidenceExcerpt, claim.evidenceLocator, claim.effectiveDate, claim.verificationStatus, claim.createdAt],
      );
    }
    return claims;
  }

  async listClaims(contentId: string): Promise<ClaimRecord[]> {
    const result = await this.pool.query(
      `SELECT cl.* FROM claims cl JOIN contents c ON c.id=cl.content_id WHERE cl.content_id=$1 AND c.team_id=$2 ORDER BY cl.created_at`,
      [contentId, this.teamId],
    );
    return result.rows.map((row) => ({
      id: row.id, contentId: row.content_id, sourceId: row.source_id, statement: row.statement,
      evidenceExcerpt: row.evidence_excerpt, evidenceLocator: row.evidence_locator,
      effectiveDate: row.effective_date ? new Date(row.effective_date).toISOString().slice(0, 10) : null,
      verificationStatus: row.verification_status, createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async saveVersion(version: ContentVersion): Promise<ContentVersion> {
    const result = await this.pool.query(
      `INSERT INTO content_versions
        (id, content_id, sequence, stage, title, body, brief, created_by, parent_version_id, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [version.id, version.contentId, version.sequence, version.stage, version.title, version.body, version.brief, version.createdBy, version.parentVersionId, version.metadata, version.createdAt],
    );
    return versionFrom(result.rows[0]!);
  }

  async listVersions(contentId: string): Promise<ContentVersion[]> {
    const result = await this.pool.query(
      `SELECT v.* FROM content_versions v JOIN contents c ON c.id=v.content_id WHERE v.content_id=$1 AND c.team_id=$2 ORDER BY v.sequence`,
      [contentId, this.teamId],
    );
    return result.rows.map(versionFrom);
  }

  async createJob(job: AutomationJob): Promise<AutomationJob> {
    const existing = await this.findJobByIdempotencyKey(job.idempotencyKey);
    if (existing) return existing;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO automation_jobs (id, content_id, idempotency_key, status, started_at, completed_at, error, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [job.id, job.contentId, job.idempotencyKey, job.status, job.startedAt, job.completedAt, job.error, job.createdAt],
      );
      await this.saveJobSteps(client, job);
      await client.query("COMMIT");
      return job;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateJob(job: AutomationJob): Promise<AutomationJob> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE automation_jobs SET status=$2, started_at=$3, completed_at=$4, error=$5 WHERE id=$1",
        [job.id, job.status, job.startedAt, job.completedAt, job.error],
      );
      await this.saveJobSteps(client, job);
      await client.query("COMMIT");
      return job;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getJob(id: string): Promise<AutomationJob | null> {
    const result = await this.pool.query(
      `SELECT j.* FROM automation_jobs j JOIN contents c ON c.id=j.content_id WHERE j.id=$1 AND c.team_id=$2`,
      [id, this.teamId],
    );
    return result.rows[0] ? this.jobFrom(result.rows[0]) : null;
  }

  async findJobByIdempotencyKey(key: string): Promise<AutomationJob | null> {
    const result = await this.pool.query(
      `SELECT j.* FROM automation_jobs j JOIN contents c ON c.id=j.content_id WHERE j.idempotency_key=$1 AND c.team_id=$2`,
      [key, this.teamId],
    );
    return result.rows[0] ? this.jobFrom(result.rows[0]) : null;
  }

  async listJobs(contentId: string): Promise<AutomationJob[]> {
    const result = await this.pool.query(
      `SELECT j.* FROM automation_jobs j JOIN contents c ON c.id=j.content_id WHERE j.content_id=$1 AND c.team_id=$2 ORDER BY j.created_at DESC`,
      [contentId, this.teamId],
    );
    return Promise.all(result.rows.map((row) => this.jobFrom(row)));
  }

  async saveQualityResults(contentId: string, results: QualityResult[]): Promise<QualityResult[]> {
    for (const result of results) {
      await this.pool.query(
        `INSERT INTO qa_results (id, content_id, version_id, category, status, score, messages, checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (version_id, category) DO UPDATE SET status=EXCLUDED.status, score=EXCLUDED.score, messages=EXCLUDED.messages, checked_at=EXCLUDED.checked_at`,
        [result.id, contentId, result.versionId, result.category, result.status, result.score, result.messages, result.checkedAt],
      );
    }
    return results;
  }

  async listQualityResults(contentId: string): Promise<QualityResult[]> {
    const result = await this.pool.query(
      `SELECT q.* FROM qa_results q JOIN contents c ON c.id=q.content_id WHERE q.content_id=$1 AND c.team_id=$2 ORDER BY q.checked_at`,
      [contentId, this.teamId],
    );
    return result.rows.map((row) => ({
      id: row.id, contentId: row.content_id, versionId: row.version_id, category: row.category, status: row.status,
      score: Number(row.score), messages: row.messages ?? [], checkedAt: new Date(row.checked_at).toISOString(),
    }));
  }

  async saveApproval(approval: ApprovalRecord): Promise<ApprovalRecord> {
    await this.pool.query(
      `INSERT INTO approvals (id, content_id, version_id, decision, actor_id, reason, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [approval.id, approval.contentId, approval.versionId, approval.decision, approval.actorId, approval.reason, approval.createdAt],
    );
    return approval;
  }

  async listApprovals(contentId: string): Promise<ApprovalRecord[]> {
    const result = await this.pool.query(
      `SELECT a.* FROM approvals a JOIN contents c ON c.id=a.content_id WHERE a.content_id=$1 AND c.team_id=$2 ORDER BY a.created_at`,
      [contentId, this.teamId],
    );
    return result.rows.map((row) => ({
      id: row.id, contentId: row.content_id, versionId: row.version_id, decision: row.decision,
      actorId: row.actor_id, reason: row.reason, createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async savePublication(publication: PublicationRecord): Promise<PublicationRecord> {
    await this.pool.query(
      `INSERT INTO publications (id, content_id, status, scheduled_at, published_at, external_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, scheduled_at=EXCLUDED.scheduled_at,
         published_at=EXCLUDED.published_at, external_url=EXCLUDED.external_url, updated_at=EXCLUDED.updated_at`,
      [publication.id, publication.contentId, publication.status, publication.scheduledAt, publication.publishedAt, publication.externalUrl, publication.createdAt, publication.updatedAt],
    );
    return publication;
  }

  async listPublications(contentId: string): Promise<PublicationRecord[]> {
    const result = await this.pool.query(
      `SELECT p.* FROM publications p JOIN contents c ON c.id=p.content_id WHERE p.content_id=$1 AND c.team_id=$2 ORDER BY p.created_at`,
      [contentId, this.teamId],
    );
    return result.rows.map((row) => ({
      id: row.id, contentId: row.content_id, status: row.status,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      externalUrl: row.external_url, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async appendAudit(event: AuditEvent): Promise<AuditEvent> {
    await this.pool.query(
      `INSERT INTO audit_logs (id, team_id, content_id, actor_id, action, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [event.id, this.teamId, event.contentId, event.actorId, event.action, event.detail, event.createdAt],
    );
    return event;
  }

  async listAuditEvents(contentId: string): Promise<AuditEvent[]> {
    const result = await this.pool.query(
      "SELECT * FROM audit_logs WHERE team_id=$1 AND content_id=$2 ORDER BY created_at",
      [this.teamId, contentId],
    );
    return result.rows.map((row) => ({
      id: row.id, contentId: row.content_id, actorId: row.actor_id ?? "system", action: row.action,
      detail: row.detail ?? {}, createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  private async saveJobSteps(client: PoolClient, job: AutomationJob): Promise<void> {
    for (const [position, step] of job.steps.entries()) {
      await client.query(
        `INSERT INTO automation_job_steps
          (job_id, stage, position, status, started_at, completed_at, output_version_id, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (job_id, stage) DO UPDATE SET status=EXCLUDED.status, started_at=EXCLUDED.started_at,
          completed_at=EXCLUDED.completed_at, output_version_id=EXCLUDED.output_version_id, error=EXCLUDED.error`,
        [job.id, step.stage, position, step.status, step.startedAt, step.completedAt, step.outputVersionId, step.error],
      );
    }
  }

  private async jobFrom(row: QueryResultRow): Promise<AutomationJob> {
    const steps = await this.pool.query("SELECT * FROM automation_job_steps WHERE job_id=$1 ORDER BY position", [row.id]);
    return {
      id: row.id, contentId: row.content_id, idempotencyKey: row.idempotency_key, status: row.status,
      steps: steps.rows.map(jobStepFrom), startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null, error: row.error,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
