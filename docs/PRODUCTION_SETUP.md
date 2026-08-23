# 실제 운영 대시보드 설정

## 완료 기준

- Cloud Run 주소에서 `carrot / carrot`으로 로그인된다.
- 대시보드의 `지금 수집`과 `콘텐츠 만들기`가 비공개 자동화 저장소의 GitHub Actions를 실행한다.
- 생성된 원고, 출처, 검수 결과, 말투 보정 결과를 대시보드에서 읽을 수 있다.
- 승인·반려·발행 예약·NAVER 게시 URL이 비공개 저장소에 기록된다.
- 회사 PC가 꺼져 있어도 정기 수집과 원고 생성이 실행된다.

실제 운영 주소는 **Cloud Run URL**이다. GitHub Pages 주소는 화면 확인용 샘플이며 실제 GitHub Actions와 연결되지 않는다.

## 전체 연결 구조

```text
사용자 브라우저
  → Cloud Run 대시보드(로그인·API)
    → GitHub API
      → naverblog-automation 비공개 저장소
        → NAVER 수집 GitHub Actions
        → Codex OAuth 원고 생성·human-tone 피드백·재작성
        → 원고와 승인·발행 상태 저장
```

Cloud Run은 요청이 없으면 0대로 줄어드는 설정이다. GitHub Actions가 수집과 생성을 담당하므로 회사 PC는 켜 둘 필요가 없다.

## 1. GitHub 토큰 만들기

GitHub 우측 상단 프로필 → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**으로 이동한다.

- Token name: `naverblog-dashboard`
- Expiration: 회사 정책에 맞는 만료일
- Repository access: `Only select repositories`
- 선택 저장소: `sunghyun1003/naverblog-automation`
- Repository permissions:
  - Actions: `Read and write`
  - Contents: `Read and write`
  - Metadata: `Read-only`(자동 포함)

생성 직후 표시되는 토큰을 복사한다. 토큰은 GitHub 저장소 변수나 코드에 넣지 않고 Google Secret Manager에만 저장한다.

**예상 결과:** 비공개 저장소의 워크플로 실행, 원고 읽기, 승인 상태 저장에 필요한 최소 권한 토큰 1개가 생긴다.

## 2. Google Cloud 사전 자원 만들기

대상 프로젝트는 `naverblog-automation-505904`이다.

### API 활성화

Google Cloud Console → **API 및 서비스** → **라이브러리**에서 다음 API를 각각 검색해 활성화한다.

- Cloud Run Admin API
- Artifact Registry API
- Secret Manager API
- IAM Service Account Credentials API

### Artifact Registry

**Artifact Registry** → **저장소 만들기**에서 다음과 같이 설정한다.

- 이름: `naverblog`
- 형식: Docker
- 모드: 표준
- 리전: `asia-northeast3`

### Cloud Run 실행용 서비스 계정

**IAM 및 관리자** → **서비스 계정** → **서비스 계정 만들기**에서 생성한다.

- 이름: `naverblog-dashboard`
- 생성되는 이메일: `naverblog-dashboard@naverblog-automation-505904.iam.gserviceaccount.com`

프로젝트 전체 역할은 여기서 추가하지 않아도 된다. 다음 단계에서 비밀별로 최소 권한을 준다.

## 3. Secret Manager에 운영 비밀값 저장하기

**보안** → **Secret Manager** → **보안 비밀 만들기**에서 아래 기본 4개를 각각 만든다. 복제 정책은 자동을 사용한다.

| 보안 비밀 이름 | 저장할 값 |
| --- | --- |
| `dashboard-username` | `carrot` |
| `dashboard-password` | `carrot` |
| `dashboard-session-secret` | 임의의 64자 이상 문자열 |
| `github-automation-token` | 1단계에서 만든 GitHub 토큰 |

`dashboard-session-secret`은 비밀번호와 다른 값이어야 한다. Google Cloud Shell에서 아래 명령을 실행하면 브라우저 화면에 임의 문자열이 출력된다.

```bash
openssl rand -hex 32
```

각 비밀을 연 뒤 **권한** → **액세스 권한 부여**에서 다음을 입력한다.

- 새 주 구성원: `naverblog-dashboard@naverblog-automation-505904.iam.gserviceaccount.com`
- 역할: `Secret Manager 보안 비밀 접근자`

**예상 결과:** Cloud Run만 로그인 값과 GitHub 토큰을 읽을 수 있고 브라우저에는 GitHub 토큰이 노출되지 않는다.

Neon PostgreSQL 운영 저장소를 연결할 때는 `dashboard-database-url`, `dashboard-database-direct-url` 2개를 추가한다. 생성·권한·마이그레이션 순서는 [Neon 설정](./NEON_SETUP.md)을 따른다.

## 4. 기존 GitHub Actions 배포 계정 권한 보강하기

기존 배포 계정은 `github-codex-automation@naverblog-automation-505904.iam.gserviceaccount.com`이다.

**IAM 및 관리자** → **IAM**에서 이 계정에 다음 역할을 부여한다.

- Cloud Run 관리자
- Artifact Registry 작성자

그 다음 **IAM 및 관리자** → **서비스 계정** → `naverblog-dashboard` → **권한** → **액세스 권한 부여**에서 다음을 추가한다.

- 새 주 구성원: `github-codex-automation@naverblog-automation-505904.iam.gserviceaccount.com`
- 역할: `서비스 계정 사용자`

## 5. Workload Identity 공급자에 공개 대시보드 저장소 허용하기

기존 공급자 `github-actions`의 속성 조건이 비공개 자동화 저장소만 허용한다면 공개 대시보드 저장소도 추가해야 한다.

**IAM 및 관리자** → **Workload Identity Federation** → 풀 `github-actions` → 공급자 `github-actions` → **수정**으로 이동한다.

속성 매핑은 기존 값을 유지하고, **속성 조건**을 다음과 같이 설정한다.

```text
assertion.repository == 'sunghyun1003/naverblog-automation' || assertion.repository == 'sunghyun1003/naverblog'
```

공급자를 삭제하거나 같은 이름으로 다시 만들 필요는 없다.

**예상 결과:** 두 저장소의 GitHub Actions만 동일한 Google Cloud 배포 계정으로 인증할 수 있다.

## 6. 공개 대시보드 저장소 변수 입력하기

GitHub `sunghyun1003/naverblog` → **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**에서 다음 6개를 입력한다.

| 이름 | 값 |
| --- | --- |
| `GCP_PROJECT_ID` | `naverblog-automation-505904` |
| `GCP_PROJECT_NUMBER` | `454698351004` |
| `GCP_SERVICE_ACCOUNT` | `github-codex-automation@naverblog-automation-505904.iam.gserviceaccount.com` |
| `GCP_REGION` | `asia-northeast3` |
| `GCP_ARTIFACT_REPOSITORY` | `naverblog` |
| `GCP_DASHBOARD_RUNTIME_SERVICE_ACCOUNT` | `naverblog-dashboard@naverblog-automation-505904.iam.gserviceaccount.com` |

GitHub의 **Secrets**에는 별도 값을 넣지 않는다. GitHub Actions는 OIDC(일회성 신원 증명)로 Google Cloud에 접속하고, 실제 비밀값은 Cloud Run이 Google Secret Manager에서 읽는다.

## 7. 첫 배포 실행하기

GitHub `sunghyun1003/naverblog` → **Actions** → `deploy-operational-dashboard` → **Run workflow** → `main` → **Run workflow**를 누른다.

성공하면 마지막 `배포 주소` 단계에 `https://naverblog-dashboard-...run.app` 형식의 주소가 표시된다. 이 주소가 실제 운영 주소다.

실패할 경우 실패한 단계별 확인 지점:

- `Google Cloud 인증`: Workload Identity 조건과 6개 GitHub 변수 확인
- `컨테이너 빌드·업로드`: Artifact Registry 이름·리전과 작성자 역할 확인
- `Cloud Run 배포`: Cloud Run 관리자, 서비스 계정 사용자, 운영용 Secret 이름과 접근자 역할 확인

## 8. 실제 운영 확인 순서

1. Cloud Run 주소 접속 → `carrot / carrot` 로그인
2. **설정** → Codex, NAVER 수집, GitHub Actions, 발행 패키지가 `연결됨`인지 확인
3. **트렌드 수집** → `지금 수집` → GitHub Actions에서 `NAVER 콘텐츠 수집` 성공 확인
4. 대시보드에서 새로고침 → 최신 수집일과 후보 목록 확인
5. **콘텐츠** → `콘텐츠 만들기` → 주제와 생성 방식 선택
6. GitHub Actions에서 `보험 원고 1건 생성` 성공 확인
7. 콘텐츠 목록 새로고침 → 새 원고 클릭
8. 원고·근거·변경 이력과 말투 보정 결과 확인
9. `수치와 출처`, `광고성 표현`을 확인한 뒤 승인
10. **발행 일정** → 날짜 저장
11. `원고 복사`로 NAVER 블로그 편집기에 붙여넣고 발행
12. 발행된 `https://blog.naver.com/...` 주소를 입력해 발행 완료 처리

## 현재 자동화되는 범위

| 영역 | 현재 동작 |
| --- | --- |
| NAVER 블로그 후보 수집 | 매일 오전 6:30, 수동 실행 가능 |
| 원고 1건 생성 | 매일 오전 7:00, 수동 실행 가능 |
| SEO·GEO 구성 | Codex 생성 단계에서 처리 |
| 사람 말투 보정 | `skills/human-tone` 피드백 후 원고 재작성 |
| 검수·승인·반려 | 대시보드에서 처리, 비공개 저장소에 기록 |
| NAVER 발행 | 원고 전체 복사 후 사람이 NAVER 에디터에서 발행 |
| 발행 기록 | 예약 시간과 실제 NAVER URL 저장 |

NAVER 블로그 편집기 자동 입력·자동 발행은 공식적으로 허용되고 안정적인 API가 확인되기 전까지 포함하지 않는다. 로그인 우회나 브라우저 매크로 대신 복사 가능한 완성 원고를 제공한다.

## 운영 시 기억할 점

- GitHub Pages는 미리보기, Cloud Run은 실제 운영 주소다.
- `carrot` 비밀번호는 초기 1인 운영용이다. 팀원이 생기기 전에 Google Workspace 로그인을 붙이고 비밀번호 로그인을 끈다.
- GitHub 토큰 만료 전에 새 토큰을 만든 뒤 `github-automation-token`에 새 버전을 추가한다.
- Secret 값을 바꾸면 Cloud Run을 다시 배포해 최신 버전을 확실히 반영한다.
- Google Cloud **결제** → **예산 및 알림**에서 월 예산과 50%·90%·100% 알림을 설정한다.
