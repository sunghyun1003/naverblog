# 대시보드 API 계약

기본 주소: `http://127.0.0.1:8787`

운영 인증은 로그인 성공 후 발급되는 `HttpOnly` 서명 쿠키를 사용한다. 상태 변경 요청은 쿠키와 함께 `X-Requested-With: dashboard` 헤더가 필요하다.

로컬 모의 모드에서는 아래 개발 헤더도 사용할 수 있다.

- `X-User-Id`: 사용자 식별자
- `X-User-Roles`: 쉼표로 구분한 역할
- `X-Idempotency-Key`: 생성·작업 중복 방지 키

운영 초기 계정은 Google Secret Manager의 `dashboard-username`, `dashboard-password`로 관리한다.

| Method | Path | 책임 |
| --- | --- | --- |
| GET | `/health` | 서버 상태 |
| POST | `/api/auth/login` | 로그인과 세션 쿠키 발급 |
| GET | `/api/auth/session` | 현재 로그인 확인 |
| POST | `/api/auth/logout` | 세션 쿠키 만료 |
| GET | `/api/system/capabilities` | 연동 준비 상태 |
| GET | `/api/automation/runs` | 수집·생성 워크플로 실행 이력 |
| POST | `/api/automation/collect` | NAVER 수집 워크플로 실행 |
| POST | `/api/automation/generate` | 원고 생성 워크플로 실행 |
| GET | `/api/contents` | 콘텐츠 목록 |
| POST | `/api/contents` | 콘텐츠 생성 |
| GET | `/api/contents/:id` | 버전·출처·주장·QA·작업 포함 상세 |
| POST | `/api/contents/:id/pipeline` | 전체 자동화 실행 |
| POST | `/api/contents/:id/approve` | 최종 확인 후 승인 |
| POST | `/api/contents/:id/images/generate` | 승인 원고 이미지 3장 생성 또는 재생성 |
| GET | `/api/contents/:id/images/:assetId` | 생성 이미지 미리보기 |
| POST | `/api/contents/:id/reject` | 반려와 사유 기록 후 기존 원고 자동 재작성 요청 |
| POST | `/api/contents/:id/schedule` | 발행 예약 |
| POST | `/api/contents/:id/publish` | 승인·예약된 원고 발행 |
| GET | `/api/trends` | 수집된 트렌드 목록 |

## 오류 형식

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "권한이 없습니다: content:approve",
    "details": null
  }
}
```

클라이언트는 메시지가 아니라 `code`를 기준으로 분기한다.
