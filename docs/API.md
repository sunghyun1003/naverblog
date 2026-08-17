# 로컬 API 계약

기본 주소: `http://127.0.0.1:8787`

개발 인증 헤더:

- `X-User-Id`: 사용자 식별자
- `X-User-Roles`: 쉼표로 구분한 역할
- `X-Idempotency-Key`: 생성·작업 중복 방지 키

개발 기본값은 `local-admin/admin`이다. 운영에서는 반드시 회사 인증 미들웨어로 교체한다.

| Method | Path | 책임 |
| --- | --- | --- |
| GET | `/health` | 서버 상태 |
| GET | `/api/system/capabilities` | 연동 준비 상태 |
| GET | `/api/contents` | 콘텐츠 목록 |
| POST | `/api/contents` | 콘텐츠 생성 |
| GET | `/api/contents/:id` | 버전·출처·주장·QA·작업 포함 상세 |
| POST | `/api/contents/:id/pipeline` | 전체 자동화 실행 |
| POST | `/api/contents/:id/approve` | 최종 확인 후 승인 |
| POST | `/api/contents/:id/reject` | 반려와 사유 기록 |
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
