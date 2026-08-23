# Neon PostgreSQL 운영 저장소 설정

## 완료 기준

- `migrate-neon-database` GitHub Actions가 성공한다.
- Cloud Run `/health`의 `database`가 `postgres`다.
- 설정 화면에 `postgres-mirror`가 연결됨으로 나타난다.
- Cloud Run을 재배포해도 원고·검수·예약 상태가 유지된다.

## 저장 구조

- 비공개 GitHub 레포: 생성 원고와 복사 패키지의 원본
- Neon PostgreSQL: 콘텐츠, 버전, 검수, 승인, 실행 이력의 운영용 미러
- Google Secret Manager: Neon 접속 문자열

GitHub 원본 조회가 일시적으로 실패하면 대시보드는 Neon에 마지막으로 저장된 데이터를 보여준다.

목록 화면은 Neon 데이터를 먼저 표시하고 GitHub 최신 원본을 뒤에서 동기화한다. 콘텐츠 화면은
열릴 때와 이후 2분마다 최신화하며, 트렌드는 화면 진입 후와 **새로고침** 버튼을 눌렀을 때 최신화한다.
따라서 GitHub 응답이 느려도 기존 목록을 가리는 로딩 화면은 표시하지 않는다.

## 1. Neon 프로젝트 생성

1. <https://console.neon.tech> 접속 및 가입
2. **New project** 선택
3. Project name: `naverblog-operations`
4. PostgreSQL version: Neon이 제안하는 기본값
5. Region: 선택 가능한 지역 중 한국과 가장 가까운 아시아 지역
6. Plan: **Free**

## 2. 접속 문자열 2개 발급

Project Dashboard의 **Connect**를 연다.

### Cloud Run용

- Connection pooling을 활성한다.
- 호스트에 `-pooler` 표시가 있는지 확인한다.
- 전체 `postgresql://...` 문자열을 복사한다.

### 마이그레이션용

- Connection pooling을 끄고 **Direct connection**을 선택한다.
- 호스트에 `-pooler`가 없는지 확인한다.
- 전체 `postgresql://...` 문자열을 복사한다.

두 값은 `sslmode=require`를 포함해야 한다. 비밀번호를 GitHub 변수나 채팅에 입력하지 않는다.
서버는 이 값을 Neon이 지원하는 가장 엄격한 `sslmode=verify-full`로 자동 보정하므로 Secret을
별도로 수정할 필요가 없다.

## 3. Google Secret Manager에 저장

Google Cloud 프로젝 `naverblog-automation-505904`에서 다음 Secret을 생성한다.

| Secret 이름 | 값 |
| --- | --- |
| `dashboard-database-url` | Neon pooled connection string |
| `dashboard-database-direct-url` | Neon direct connection string |

## 4. Secret 접근 권한

`dashboard-database-url`에는 Cloud Run 실행 계정만 **Secret Manager Secret Accessor
(`roles/secretmanager.secretAccessor`)**로 추가한다.

- `naverblog-dashboard@naverblog-automation-505904.iam.gserviceaccount.com`

`dashboard-database-direct-url`에는 마이그레이션 실행 계정만 같은 역할로 추가한다.

- `github-codex-automation@naverblog-automation-505904.iam.gserviceaccount.com`

## 5. 데이터베이스 마이그레이션

GitHub `sunghyun1003/naverblog` → **Actions** → **migrate-neon-database** → **Run workflow**를 실행한다.

기대 결과:

- `Applied 001_initial.sql`
- `"status":"ok"`
- `"teamId":"carrot-company"`

## 6. Cloud Run 재배포

**deploy-operational-dashboard** → **Run workflow**를 실행한다.

배포 완료 후 Cloud Run URL의 `/health`에서 `"database":"postgres"`를 확인한다.

## 7. 운영 데이터 동기화 검증

1. 대시보드에 로그인한다.
2. **콘텐츠** 목록과 원고 상세를 한 번 연다.
3. **트렌드 수집** 화면을 연다.
4. **설정**에서 `postgres-mirror · 연결됨`을 확인한다.
5. Cloud Run을 다시 배포한 뒤 동일한 데이터가 남는지 확인한다.

## 문제 발생 시

- `Secret not found`: Secret 이름과 프로젝트를 확인한다.
- `Permission denied`: 해당 Secret의 Secret Accessor 권한을 확인한다.
- `password authentication failed`: Neon에서 접속 문자열을 다시 복사해 새 Secret 버전으로 추가한다.
- `운영 팀을 찾을 수 없습니다`: `migrate-neon-database`를 먼저 실행한다.
