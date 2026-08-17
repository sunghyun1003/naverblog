# 블로그 운영센터

보험·금융 네이버 블로그 콘텐츠를 기획, 생성, 검수, 승인, 발행하기 위한 팀용 관제 시스템입니다.

현재 구현 범위는 외부 연동 전 전체 로컬 자동화 버전입니다.

- 콘텐츠 운영 대시보드
- 검색 및 진행 상태 필터
- 콘텐츠 생성 요청 모달
- 원고 검토 상세 화면
- 사실 근거, SEO, GEO, 말투 보정, 광고 위험 검수 UI
- 최종 체크 후 승인 처리
- 데스크톱·모바일 반응형 레이아웃
- Fastify 기반 콘텐츠 API
- 역할 권한과 콘텐츠 상태 전이
- 트렌드 수집부터 검토 요청까지 9단계 자동화
- 원고 버전, 출처, 주장, QA, 승인, 감사 이력
- 인메모리·PostgreSQL 교체형 저장소와 초기 마이그레이션
- 중복 방지와 실패 이력 보존
- GitHub Actions 자동 검증

## 실행

```bash
npm install
npm run dev:api
npm run dev:web
```

기본 실행은 외부 키가 전혀 필요 없는 `memory + mock` 모드입니다. 환경변수 목록은 [`.env.example`](./.env.example)에 있습니다.

## 검증

```bash
npm run verify
```

전체 구조는 [아키텍처](./docs/ARCHITECTURE.md), 내일 필요한 결정은 [연동 체크리스트](./docs/INTEGRATION_CHECKLIST.md), 사내 입력 양식은 [운영 정책 템플릿](./docs/POLICY_TEMPLATE.md), 현재 검증 결과는 [검증 기록](./docs/VERIFICATION.md)을 참고하세요.
