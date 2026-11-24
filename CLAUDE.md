# 블로그 운영센터 (대시보드) — Claude Code 작업 기준

보험 네이버 블로그 원고를 관리하는 대시보드. 원고 생성·수집은 비공개 레포 `sunghyun1003/naverblog-automation`이 담당하고, 이 레포는 화면·로그인·API·PC 임시저장 도우미를 담당한다.

## 현재 운영 기준 (최우선)
@docs/CURRENT_STATE.md

`docs/ARCHITECTURE.md`, `docs/OPERATIONS_RUNBOOK.md`, `docs/DEVELOPMENT_PLAN.md`, 날짜가 붙은 문서는 **과거 기록**이다. 현재 코드·테스트·CURRENT_STATE와 다르면 옛 절차(승인 대기, 수동 체크리스트 등)를 복원하지 않는다.

## 운영 구성
- 화면: Firebase Hosting `carrot-blog.web.app` → `/api/**`·`/health`는 Cloud Run `naverblog-dashboard`(asia-northeast3)로 rewrite (`firebase.json`).
- API: Fastify(`server/`), Cloud Run 최소 인스턴스 0. GCP 프로젝트 `naverblog-automation-505904`(2026-11-18 유료 계정 전환. 결제가 꺼지면 Cloud Run이 비JSON 500/503을 돌려주고 화면에는 "API 요청에 실패했습니다"로 보인다).
- DB: Neon 무료 플랜(싱가포르) = 화면용 조회 사본. 쉬다가 깨어나면 첫 연결이 느리므로 `server/bootstrap.ts`가 시작 시 최대 8회 재시도한다. 원본은 자동화 레포의 GitHub 파일이다.
- 비밀값: Google Secret Manager `dashboard-username`, `dashboard-password`, `dashboard-session-secret`, `github-automation-token`(Fine-grained PAT, 만료 시 GitHub 연동 401/403), `dashboard-database-url`, `dashboard-database-direct-url`. 값을 출력·커밋하지 않는다.
- PC 임시저장 도우미: `local-writer/` (Windows, Node 22+, 대상 `hanwhains_carrot` 카테고리 `자동차보험` 63). 자동 발행 금지. `docs/local-writer.md`.

## 배포 — main에 올리면 바로 실서비스
- `main` push → `cloud-run.yml`: 검증 → DB 마이그레이션·검증 → Cloud Run → Firebase 배포. **작업은 브랜치에서 하고, main 반영은 사용자 승인 후에만.**
- DB 스키마 변경은 `server/db/migrations/`에 새 번호 파일로만 추가한다(기존 파일 수정 금지). 배포 단계가 `db:migrate`·`db:verify`를 자동 실행하고, 서버 시작 시 `bootstrap.ts`가 필수 스키마를 확인한다.

## 검증 (변경 후 반드시)
```bash
npm run verify            # 타입 검사 + 테스트 202개+ + 빌드. 실패하면 커밋하지 않는다
npm run writer:test       # local-writer를 건드렸을 때 (사전: npm ci --prefix local-writer --ignore-scripts)
```
- 화면 계약 테스트(`tests/layout-ui-contract.test.ts`, `tests/review-ui-contract.test.ts`)가 기존 화면 정책(좌측 정렬, 제거한 UI 등)을 지킨다. 테스트를 고쳐 통과시키지 말고, 정책 변경이 사용자 요청일 때만 테스트를 함께 바꾼다.
- 테스트를 건너뛰거나 삭제해서 통과시키지 않는다.

## 자동화 레포와의 계약 (깨지면 운영이 멈춤)
`server/services/github-automation.ts`가 GitHub API로 자동화 레포를 읽고 쓴다. 아래를 바꿀 땐 **두 레포를 함께** 수정·검증한다.
- 읽기: `output/drafts/YYYY-MM-DD/run-ID/{status,article,recovery,evidence-package,*-quality,tone-*}.json`, `.../images/{manifest,status}.json`, `.../revisions/vN/`, `output/history/index.json`, `data/latest.json`, `config/automation-settings.json`.
- 쓰기: `dashboard/decisions/run-ID.json`, `dashboard/compliance-feedback/ID.json`, `dashboard/publication-records/ID.json`, `config/automation-settings.json`, 그리고 `collect.yml`·`generate.yml`의 `# dashboard-schedule:start` ~ `# dashboard-schedule:end` 블록.
- 실행: `collect.yml`, `generate.yml`, `rewrite.yml`, `images.yml`을 파일명과 inputs로 dispatch.
- 동기화: 자동화 레포의 `.github/workflows/sync-dashboard.yml`(main)만 OIDC로 `/api/internal/sync` 호출 가능(`server/services/github-oidc.ts`가 경로·브랜치·이벤트를 고정 검증).
- 반대 방향: 자동화 레포가 이 레포 main의 `samples/`(+`scripts/build-approved-samples.py`)와 `images/`를 체크아웃해 원고 문체·이미지 기준으로 쓴다. 이 폴더의 파일명·구조를 바꾸면 자동화 생성 품질에 영향이 간다.

## 작업 원칙
- 사용자는 개발자가 아닌 마케터다. 결과는 쉬운 말로 설명하고, 실서비스 반영·유료 AI 호출(생성·이미지·재작성 workflow 실행)은 먼저 확인받는다.
- 요청 범위만 고친다. 기존 원고·이미지·심의 의견·수동 수정본을 일괄 재작성하지 않는다.
