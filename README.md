# 블로그 운영센터

보험·금융 네이버 블로그 콘텐츠를 기획, 생성, 검수, 승인, 발행하기 위한 팀용 관제 시스템입니다.

Cloud Run 운영 모드에서는 비공개 GitHub Actions 자동화와 연결되고, 로컬에서는 외부 키 없는 모의 데이터로 같은 흐름을 검증할 수 있습니다.

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
- `carrot / carrot` 초기 로그인과 서버 서명 세션
- GitHub Actions 수집·원고 생성 수동 실행
- 실제 생성 원고·출처·검수 결과 표시
- 승인·반려·발행 예약·NAVER 게시 URL 기록

## 실행

```bash
npm install
npm run dev:api
npm run dev:web
```

기본 실행은 외부 키가 전혀 필요 없는 `memory + mock` 모드입니다. 환경변수 목록은 [`.env.example`](./.env.example)에 있습니다.

## 웹 미리보기

`main` 브랜치가 갱신되면 GitHub Pages용 화면이 자동으로 빌드됩니다. GitHub Pages는 샘플 데이터용 미리보기다. 실제 자동화는 Cloud Run 주소에서 사용하며 설정 순서는 [실제 운영 대시보드 설정](./docs/PRODUCTION_SETUP.md)을 따른다.

## 검증

```bash
npm run verify
```

전체 구조는 [아키텍처](./docs/ARCHITECTURE.md), 실제 배포는 [운영 설정](./docs/PRODUCTION_SETUP.md), Neon 연결은 [Neon 운영 저장소 설정](./docs/NEON_SETUP.md), 사내 입력 양식은 [운영 정책 템플릿](./docs/POLICY_TEMPLATE.md), 현재 검증 결과는 [검증 기록](./docs/VERIFICATION.md)을 참고하세요.
