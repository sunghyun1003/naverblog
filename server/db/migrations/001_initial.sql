CREATE TABLE teams (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id),
  external_subject text,
  email text NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, email),
  UNIQUE (team_id, external_subject)
);

CREATE TABLE roles (
  code text PRIMARY KEY CHECK (code IN ('planner', 'editor', 'reviewer', 'approver', 'publisher', 'admin')),
  description text NOT NULL
);

INSERT INTO roles (code, description) VALUES
  ('planner', '콘텐츠 기획과 파이프라인 실행'),
  ('editor', '원고 생성과 편집'),
  ('reviewer', '근거 및 표현 검수'),
  ('approver', '최종 승인과 반려'),
  ('publisher', '예약 및 발행'),
  ('admin', '전체 관리')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE user_roles (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code text NOT NULL REFERENCES roles(code),
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE contents (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id),
  creation_key text NOT NULL,
  title text NOT NULL,
  topic text NOT NULL,
  strategy text NOT NULL CHECK (strategy IN ('trend', 'original')),
  state text NOT NULL CHECK (state IN ('idea', 'researching', 'brief_ready', 'drafting', 'review_ready', 'approved', 'scheduled', 'published', 'measured')),
  assignee_id text REFERENCES users(id),
  created_by text NOT NULL REFERENCES users(id),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, creation_key)
);

CREATE TABLE trend_signals (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id),
  source_type text NOT NULL CHECK (source_type IN ('naver_blog', 'community', 'youtube', 'official')),
  title text NOT NULL,
  canonical_url text NOT NULL,
  published_at timestamptz,
  engagement_score numeric(5,2) NOT NULL CHECK (engagement_score BETWEEN 0 AND 100),
  relevance_score numeric(5,2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  trust_score numeric(5,2) NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  topic_key text NOT NULL,
  collected_at timestamptz NOT NULL,
  UNIQUE (team_id, canonical_url)
);

CREATE TABLE sources (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  organization text NOT NULL,
  title text NOT NULL,
  canonical_url text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('official', 'trend')),
  published_at timestamptz,
  collected_at timestamptz NOT NULL,
  trust_grade text NOT NULL CHECK (trust_grade IN ('A', 'B', 'C')),
  UNIQUE (content_id, canonical_url)
);

CREATE TABLE claims (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES sources(id),
  statement text NOT NULL,
  evidence_excerpt text NOT NULL,
  evidence_locator text NOT NULL,
  effective_date date,
  verification_status text NOT NULL CHECK (verification_status IN ('verified', 'needs_review', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_versions (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  stage text NOT NULL CHECK (stage IN ('brief', 'draft', 'seo', 'geo', 'human_tone', 'manual')),
  title text NOT NULL,
  body text NOT NULL,
  brief jsonb,
  created_by text NOT NULL REFERENCES users(id),
  parent_version_id text REFERENCES content_versions(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, sequence)
);

CREATE TABLE automation_jobs (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_job_steps (
  job_id text NOT NULL REFERENCES automation_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('collect_trends', 'verify_sources', 'create_brief', 'write_draft', 'optimize_seo', 'optimize_geo', 'humanize_tone', 'quality_assurance', 'notify_review')),
  position integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  output_version_id text REFERENCES content_versions(id),
  error text,
  PRIMARY KEY (job_id, stage),
  UNIQUE (job_id, position)
);

CREATE TABLE qa_results (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_id text NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('facts', 'seo', 'geo', 'tone', 'advertising')),
  status text NOT NULL CHECK (status IN ('passed', 'warning', 'failed')),
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_at timestamptz NOT NULL,
  UNIQUE (version_id, category)
);

CREATE TABLE approvals (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_id text NOT NULL REFERENCES content_versions(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  actor_id text NOT NULL REFERENCES users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publications (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('prepared', 'scheduled', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_open_publication_per_content
  ON publications (content_id)
  WHERE status IN ('prepared', 'scheduled');

CREATE TABLE audit_logs (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id),
  content_id text REFERENCES contents(id) ON DELETE SET NULL,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_metrics (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  measured_on date NOT NULL,
  views integer CHECK (views >= 0),
  visitors integer CHECK (visitors >= 0),
  reactions integer CHECK (reactions >= 0),
  comments integer CHECK (comments >= 0),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (content_id, measured_on)
);

CREATE INDEX contents_team_state_updated_idx ON contents (team_id, state, updated_at DESC);
CREATE INDEX trend_signals_topic_score_idx ON trend_signals (team_id, topic_key, relevance_score DESC, engagement_score DESC);
CREATE INDEX claims_content_status_idx ON claims (content_id, verification_status);
CREATE INDEX versions_content_sequence_idx ON content_versions (content_id, sequence DESC);
CREATE INDEX jobs_content_created_idx ON automation_jobs (content_id, created_at DESC);
CREATE INDEX audit_team_created_idx ON audit_logs (team_id, created_at DESC);
CREATE INDEX audit_content_created_idx ON audit_logs (content_id, created_at DESC);

COMMENT ON TABLE content_versions IS '자동화 각 단계와 사람 수정 버전을 덮어쓰지 않고 보존한다.';
COMMENT ON TABLE claims IS '원고의 사실 주장과 근거 위치를 연결하는 주장 장부다.';
COMMENT ON TABLE automation_jobs IS '콘텐츠 상태와 분리된 자동화 실행 상태다.';
COMMENT ON COLUMN automation_jobs.idempotency_key IS '재시도 시 중복 실행을 방지하는 고유 키다.';

INSERT INTO teams (id, name) VALUES
  ('carrot-company', '블로그 운영센터')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO users (id, team_id, external_subject, email, display_name) VALUES
  ('carrot', 'carrot-company', 'carrot', 'carrot@users.invalid', 'carrot'),
  ('github-actions', 'carrot-company', 'github-actions', 'github-actions@users.invalid', 'GitHub Actions'),
  ('system', 'carrot-company', 'system', 'system@users.invalid', '자동화 시스템')
ON CONFLICT (id) DO UPDATE SET
  team_id = EXCLUDED.team_id,
  external_subject = EXCLUDED.external_subject,
  display_name = EXCLUDED.display_name,
  updated_at = now();

INSERT INTO user_roles (user_id, role_code) VALUES
  ('carrot', 'admin'),
  ('github-actions', 'editor'),
  ('system', 'admin')
ON CONFLICT (user_id, role_code) DO NOTHING;
